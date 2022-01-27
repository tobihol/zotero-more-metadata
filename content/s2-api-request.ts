declare const Zotero: any

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

function getPaperWithS2Id(s2id, fields) {
  const es2id = encodeURIComponent(s2id)
  return makeS2Request(`paper/${es2id}?`, {
    fields,
  })
}

function getPaperWithDoi(doi, fields) {
  const edoi = encodeURIComponent(doi)
  return makeS2Request(`paper/DOI:${edoi}?`, {
    fields,
  })
}

export function requestChainS2(item, fields) {
  return new Promise((resolve, reject) => {
    const doi = item.getField('DOI')
    if (!doi) {
      reject("Entry doesn't have a DOI.")
    }
    getPaperWithDoi(doi, fields)
      .then((resp => {
        resolve(resp)
      }))
      .catch(err => {
        // err = {"status":403,"statusText":"Forbidden"} if rate limit is reached
        // err = {"status":404,"statusText":"Not Found"} if doi not found
        reject(err)
      })
  })
}
