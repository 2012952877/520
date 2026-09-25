/* 数据存取层。
   读：有 token 就走 GitHub API（提交完立刻能读到），没有就读站点上的 data/*.json。
       两种情况都会在 localStorage 留一份缓存，所以断网 / 刚提交完 Pages 还没重建时页面也不空。
   写：GitHub Contents API，需要一个只对本仓库有 Contents 写权限的 fine-grained token。
       token 只存在本机 localStorage，不会出现在页面源码里。*/
(function (root) {
  'use strict';

  var REPO_OWNER = '2012952877';
  var REPO_NAME = '520';
  var BRANCH = 'main';
  var API = 'https://api.github.com';

  var TOKEN_KEY = 'love.gh.token';
  var CACHE_PREFIX = 'love.cache.';

  var shas = {};          // path -> 最近一次见到的文件 sha，写回时要带上
  var writeChain = Promise.resolve(); // 串行化写入，避免同一文件并发提交撞 sha

  // ---------- 编解码 ----------

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    return bytesToBase64(bytes);
  }

  function bytesToBase64(bytes) {
    var bin = '';
    var CHUNK = 0x8000; // 一次 fromCharCode 太多参数会爆栈
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function base64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ---------- token ----------

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* 无痕模式等，忽略 */ }
  }

  function canWrite() {
    return !!getToken();
  }

  // 验证 token 是否真的能写这个仓库
  function verifyToken(token) {
    return fetch(API + '/repos/' + REPO_OWNER + '/' + REPO_NAME, {
      headers: ghHeaders(token)
    }).then(function (res) {
      if (res.status === 401) throw new Error('token 无效或已过期');
      if (res.status === 404) throw new Error('这个 token 看不到 ' + REPO_OWNER + '/' + REPO_NAME + '，检查一下仓库有没有勾选');
      if (!res.ok) throw new Error('GitHub 返回 ' + res.status);
      return res.json();
    }).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error('这个 token 只能读不能写，Contents 权限要选 Read and write');
      }
      return true;
    });
  }

  function ghHeaders(token) {
    return {
      'Authorization': 'Bearer ' + (token || getToken()),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  // ---------- 本地缓存 ----------

  function readCache(path) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + path);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCache(path, data) {
    try { localStorage.setItem(CACHE_PREFIX + path, JSON.stringify(data)); } catch (e) { /* 配额满，忽略 */ }
  }

  // ---------- 读 ----------

  /* 返回 {data, source}，source 是 'github' | 'site' | 'cache' | 'empty'。
     fallback 是文件不存在时的默认值。*/
  function loadJSON(path, fallback) {
    var token = getToken();
    var attempt = token ? loadViaApi(path) : Promise.reject(new Error('no token'));

    return attempt
      .catch(function () { return loadViaSite(path); })
      .then(function (result) {
        writeCache(path, result.data);
        return result;
      })
      .catch(function (err) {
        var cached = readCache(path);
        if (cached) return { data: cached, source: 'cache' };
        if (err && err.notFound) return { data: fallback, source: 'empty' };
        var c2 = readCache(path);
        if (c2) return { data: c2, source: 'cache' };
        return { data: fallback, source: 'empty' };
      });
  }

  function loadViaApi(path) {
    return fetch(API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + path + '?ref=' + BRANCH, {
      headers: ghHeaders(), cache: 'no-store'
    }).then(function (res) {
      if (res.status === 404) {
        delete shas[path];
        var e = new Error('not found'); e.notFound = true; throw e;
      }
      if (!res.ok) throw new Error('GitHub 返回 ' + res.status);
      return res.json();
    }).then(function (file) {
      shas[path] = file.sha;
      return { data: JSON.parse(base64ToUtf8(file.content)), source: 'github' };
    });
  }

  function loadViaSite(path) {
    return fetch('./' + path + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 404) { var e = new Error('not found'); e.notFound = true; throw e; }
        if (!res.ok) throw new Error('站点返回 ' + res.status);
        return res.json();
      }).then(function (data) {
        return { data: data, source: 'site' };
      });
  }

  // ---------- 写 ----------

  function putFile(path, base64Content, message) {
    return fetchSha(path).then(function (sha) {
      var body = { message: message, content: base64Content, branch: BRANCH };
      if (sha) body.sha = sha;
      return fetch(API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + path, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
        body: JSON.stringify(body)
      });
    }).then(function (res) {
      if (res.status === 409 || res.status === 422) {
        // sha 过期了（别处刚改过），重新取一次再试
        delete shas[path];
        return fetchSha(path).then(function (sha) {
          var body = { message: message, content: base64Content, branch: BRANCH };
          if (sha) body.sha = sha;
          return fetch(API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + path, {
            method: 'PUT',
            headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
            body: JSON.stringify(body)
          });
        });
      }
      return res;
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.message || ('GitHub 返回 ' + res.status));
        });
      }
      return res.json();
    }).then(function (result) {
      if (result.content) shas[path] = result.content.sha;
      return result;
    });
  }

  function fetchSha(path) {
    if (shas[path]) return Promise.resolve(shas[path]);
    return fetch(API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + path + '?ref=' + BRANCH, {
      headers: ghHeaders(), cache: 'no-store'
    }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json().then(function (f) { shas[path] = f.sha; return f.sha; });
    }).catch(function () { return null; });
  }

  function saveJSON(path, data, message) {
    writeCache(path, data); // 先写缓存，提交失败也不会丢掉刚输入的内容
    if (!canWrite()) return Promise.reject(new Error('还没设置 token，内容只存在这台设备上'));
    writeChain = writeChain.then(function () {
      return putFile(path, utf8ToBase64(JSON.stringify(data, null, 2)), message);
    }, function () {
      return putFile(path, utf8ToBase64(JSON.stringify(data, null, 2)), message);
    });
    return writeChain;
  }

  function saveBinary(path, bytes, message) {
    if (!canWrite()) return Promise.reject(new Error('还没设置 token'));
    writeChain = writeChain.then(function () {
      return putFile(path, bytesToBase64(bytes), message);
    }, function () {
      return putFile(path, bytesToBase64(bytes), message);
    });
    return writeChain;
  }

  function deleteFile(path, message) {
    if (!canWrite()) return Promise.resolve();
    return fetchSha(path).then(function (sha) {
      if (!sha) return null;
      return fetch(API + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' + path, {
        method: 'DELETE',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
        body: JSON.stringify({ message: message, sha: sha, branch: BRANCH })
      }).then(function () { delete shas[path]; });
    }).catch(function () { /* 图片删不掉不该挡住主流程 */ });
  }

  root.Store = {
    owner: REPO_OWNER,
    repo: REPO_NAME,
    branch: BRANCH,
    getToken: getToken,
    setToken: setToken,
    canWrite: canWrite,
    verifyToken: verifyToken,
    loadJSON: loadJSON,
    saveJSON: saveJSON,
    saveBinary: saveBinary,
    deleteFile: deleteFile
  };
})(window);
