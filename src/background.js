import { defaultConfig, getKeywords } from "./config.js";

chrome.runtime.onInstalled.addListener((details) => {
  const RULE = [
    {
      "id": 1,
      "priority": 1,
      "action": {
        "type": "modifyHeaders",
        "requestHeaders": [
          {
            "header": "referer",
            "operation": "set",
            "value": "https://www.pixiv.net/"
          }
        ]
      },
      "condition": {
        initiatorDomains: [chrome.runtime.id],
        "urlFilter": "pixiv.net",
        "resourceTypes": [
          "xmlhttprequest",
        ]
      }
    },
    {
      "id": 2,
      "priority": 1,
      "action": {
        "type": "modifyHeaders",
        "requestHeaders": [
          {
            "header": "referer",
            "operation": "set",
            "value": "https://www.pixiv.net/"
          }
        ]
      },
      "condition": {
        initiatorDomains: [chrome.runtime.id],
        "urlFilter": "pximg.net",
        "resourceTypes": [
          "xmlhttprequest",
        ]
      }
    }
  ];
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: RULE.map(o => o.id),
    addRules: RULE,
  });
});

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
}
class Queue {
  constructor(maxsize) {
    this.maxsize = maxsize;
    this.array = [];
  }
  empty() {
    return this.array.length === 0;
  }
  full() {
    return this.array.length === this.maxsize;
  }
  size() {
    return this.array.length;
  }
  capacity() {
    return this.maxsize;
  }
  pop() {
    if (!this.empty()) {
      return this.array.shift();
    }
  }
  push(item) {
    if (!this.full()) {
      this.array.push(item);
      return true;
    }
    return false;
  }
}

async function fetchPixivJson(url) {
  try {
    let res = await fetch(url);
    if (!res.ok) {
      console.error(`Fetch pixiv json failed: ${res.status} ${res.statusText}`);
      return null;
    }
    let res_json = await res.json();
    if (res_json.error) {
      console.error(`Pixiv API error: ${res_json.message}`);
      return null;
    }
    return res_json;
  } catch (e) {
    console.error(`Fetch pixiv json error:`, e);
    return null;
  }
}

async function fetchImage(url) {
  try {
    let res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch (e) {
    console.error(`Fetch image error:`, e);
    return null;
  }
}

let baseUrl = "https://www.pixiv.net";
let illustInfoUrl = "/ajax/illust/";
let searchUrl = "/ajax/search/illustrations/";

class SearchSource {
  constructor(config) {
    this.searchParam = config;
    this.params = ["order", "mode", "p", "s_mode", "type", "scd", "ecd", "blt", "bgt"];
    this.totalPage = 0;
    this.itemsPerPage = 60;
    this.illustInfoPages = {};
  }

  updateConfig(config) {
    this.searchParam = config;
    this.totalPage = 0;
    this.illustInfoPages = {};
  }

  replaceSpecialCharacter = (function () {
    var reg = /[!'()~]/g;
    var mapping = {
      "!": "%21",
      "'": "%27",
      "(": "%28",
      ")": "%29",
      "~": "%7E",
    };
    var map = function (e) {
      return mapping[e];
    };
    var fn = function (e) {
      return encodeURIComponent(e).replace(reg, map);
    };
    return fn;
  })();

  generateSearchUrl(p = 1) {
    let sp = this.searchParam;
    sp.p = p;
    let word = getKeywords(sp.andKeywords, sp.orKeywords, sp.minusKeywords);
    let firstPart = encodeURIComponent(word);
    let secondPartArray = [];
    secondPartArray.push("?word=" + this.replaceSpecialCharacter(word));
    for (let o of this.params) {
      if (sp.hasOwnProperty(o) && sp[o]) {
        secondPartArray.push(`${o}=${sp[o]}`);
      }
    }
    let secondPart = secondPartArray.join("&");
    return firstPart + secondPart;
  }

  async searchIllustPage(p) {
    let paramUrl = this.generateSearchUrl(p);
    let jsonResult = await fetchPixivJson(baseUrl + searchUrl + paramUrl);
    return jsonResult;
  }

  async getRandomIllust() {
    const MAX_RETRIES = 5;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        if (this.totalPage === 0) {
          let firstPage = await this.searchIllustPage(1);
          if (!firstPage || !firstPage.body) continue;
          let total = firstPage.body.illust.total;
          this.totalPage = Math.ceil(total / this.itemsPerPage);
          if (this.totalPage === 0) return null;
        }
        
        let randomPage = getRandomInt(0, this.totalPage) + 1;
        if (!this.illustInfoPages[randomPage]) {
          let pageObj = await this.searchIllustPage(randomPage);
          if (!pageObj || !pageObj.body) continue;
          
          let total = pageObj.body.illust.total;
          let tp = Math.ceil(total / this.itemsPerPage);
          if (tp > this.totalPage) {
            this.totalPage = tp;
          }
          
          // filter images
          pageObj.body.illust.data = pageObj.body.illust.data.filter(
            (el) => {
              let condition1 = !this.searchParam.min_sl || el.sl >= this.searchParam.min_sl;
              let condition2 = !this.searchParam.max_sl || el.sl <= this.searchParam.max_sl;
              let condition3 = !this.searchParam.aiType || el.aiType == this.searchParam.aiType;
              return condition1 && condition2 && condition3;
            }
          );
          this.illustInfoPages[randomPage] = pageObj.body.illust.data;
        }
        
        let illustArray = this.illustInfoPages[randomPage];
        if (!illustArray || illustArray.length === 0) continue;

        let randomIndex = getRandomInt(0, illustArray.length);
        let res = {};
        res.illustId = illustArray[randomIndex].id;
        res.profileImageUrl = illustArray[randomIndex].profileImageUrl;
        
        let illustInfo = await fetchPixivJson(baseUrl + illustInfoUrl + res.illustId);
        if (!illustInfo || !illustInfo.body) continue;

        res.userName = illustInfo.body.userName;
        res.userId = illustInfo.body.userId;
        res.illustId = illustInfo.body.illustId;
        res.userIdUrl = baseUrl + "/users/" + illustInfo.body.userId;
        res.illustIdUrl = baseUrl + "/artworks/" + illustInfo.body.illustId;
        res.title = illustInfo.body.title;
        res.imageObjectUrl = illustInfo.body.urls.regular;
        
        let [imgBlob, profileBlob] = await Promise.all([
          fetchImage(res.imageObjectUrl),
          fetchImage(res.profileImageUrl)
        ]);
        
        if (!imgBlob) continue;
        res.imageObjectUrl = await blobToDataUrl(imgBlob);
        
        if (profileBlob) {
             try {
                res.profileImageUrl = await blobToDataUrl(profileBlob);
             } catch (e) {
                // ignore profile image error
             }
        }
        return res;
      } catch (e) {
        console.error("Error in getRandomIllust loop:", e);
        continue;
      }
    }
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

let searchSource;
let illust_queue;
let running = 0;

function fillQueue() {
  while (running < illust_queue.capacity() - illust_queue.size()) {
    ++running;
    setTimeout(async () => {
      if (illust_queue.full()) { return; }
      let res = await searchSource.getRandomIllust();
      if (res) {
        illust_queue.push(res);
        chrome.storage.session.set({ illustQueue: illust_queue });
      }
      --running;
    }, 0);
  }
}

async function start() {
  let config = await chrome.storage.local.get(defaultConfig);
  searchSource = new SearchSource(config);
  let queue_cache = await chrome.storage.session.get("illustQueue");
  
  if (Object.keys(queue_cache).length === 0) {
    illust_queue = new Queue(2);
  } else {
    illust_queue = Object.setPrototypeOf(queue_cache.illustQueue, Queue.prototype)
  }

  fillQueue();
  console.log("background script loaded");
}

let initPromise = start();

chrome.runtime.onMessage.addListener(function (
  message,
  sender,
  sendResponse
) {
  (
    async () => {
      await initPromise;
      if (message.action === "fetchImage") {
        let res = illust_queue.pop();
        if (!res) {
          res = await searchSource.getRandomIllust();
        }
        if (res) {
          sendResponse(res);
          let { profileImageUrl, imageObjectUrl, ...filteredRes } = res;
          console.log(filteredRes);
        } else {
          sendResponse(null);
        }
        fillQueue();
      } else if (message.action === "updateConfig") {
        let config = await chrome.storage.local.get(defaultConfig);
        searchSource.updateConfig(config);
        illust_queue = new Queue(2);
        chrome.storage.session.set({ illustQueue: illust_queue });
        fillQueue();
      }
    }
  )();
  return true;
});
