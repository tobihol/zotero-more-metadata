declare const Zotero: any

export enum StatusCode {
  Success = 200,
  Ratelimit = 403,
  NotFound = 404,
}

const baseUrl = 'https://api.semanticscholar.org/graph/v1/'

function makeRequest(opts) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let params = opts.params
    if (params && typeof params === 'object') {
      params = Object.keys(params).map(
        key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&')
    }
    const url = opts.url + params
    Zotero.debug(`[more-metadata]: s2 api request: ${url}`)
    xhr.open(opts.method, url)
    xhr.onload = function() {
      // tslint:disable-next-line:no-magic-numbers
      if (this.status >= 200 && this.status < 300) {
        resolve(xhr.response)
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText,
        })
      }
    }
    xhr.onerror = function() {
      reject({
        status: this.status,
        statusText: xhr.statusText,
      })
    }
    if (opts.headers) {
      Object.keys(opts.headers).forEach(key => {
        xhr.setRequestHeader(key, opts.headers[key])
      })
    }
    xhr.responseType = 'json'
    xhr.send()
  })
}

function makeS2Request(reqType, params) {
  return makeRequest({
    method: 'GET',
    url: baseUrl + reqType,
    headers: {},
    params,
  })
}

function searchPaper(query, fields) {
  return makeS2Request('paper/search?', {
    query,
    offset: 0,
    limit: 10,
    fields,
  })
}

function searchPaperWithS2Id(s2id, fields) {
  const es2id = encodeURIComponent(s2id)
  return makeS2Request(`paper/${es2id}?`, {
    fields,
  })
}

function searchPaperWithDoi(doi, fields) {
  const edoi = encodeURIComponent(doi)
  return makeS2Request(`paper/DOI:${edoi}?`, {
    fields,
  })
}

export function searchPaperWithItem(item, fields) {
  return new Promise((resolve, reject) => {
    const doi = item.getField('DOI')
    if (!doi) {
      reject("Entry doesn't have a DOI.")
    }
    searchPaperWithDoi(doi, fields)
      .then(resolve)
      .catch(reject)
  })
}
