declare const Zotero: any

import { ProgressWindow } from './ProgressWindow.js'
import { getLocalization } from './utils'

export enum Operation {
  Update = 'update',
  Remove = 'remove',
  Error = 'error',
  Abort = 'abort',
  Ratelimit = 'ratelimit',
}

const closeTimer = 4000

export class MoreProgressWindow {
  public finished: boolean = false
  public operation: string
  private progressWin: any
  private nAll: number = 0
  private nDone: number = 0
  private nFail: number = 0
  private onClickFuncs: ((data: string) => void)[] = []

  constructor(operation: string, nAll: number) {
    this.progressWin = new ProgressWindow({ closeOnClick: false })
    this.progressWin.progress = new this.progressWin.ItemProgress()
    this.operation = operation
    this.nAll = nAll
    this.nDone = 0
    this.updateHeadline()
    this.updateText()
    this.progressWin.show()
  }

  public addOnClickFunc(func) {
    this.onClickFuncs.push(func)
    this.progressWin.getProgressWindow().addEventListener('mouseup', func)
  }

  public removeAllOneClickFuncs() {
    this.onClickFuncs.forEach(func => {
      this.progressWin.getProgressWindow().removeEventListener('mouseup', func)
    })
  }

  public next(fail = false) {
    if (fail) this.nFail++
    this.nDone++
    const percent = Math.round((this.nDone / this.nAll) * 100) // tslint:disable-line:no-magic-numbers
    this.progressWin.progress.setProgress(percent)
    this.updateText()
  }

  public finish(outcome = this.operation) {
    this.finished = true
    this.endWindow(outcome)
  }

  public setText(text: string) {
    this.progressWin.progress.setText(text)
  }

  public tmpWindow(headline: string, text: string, time: number = closeTimer): ProgressWindow {
    const cutoff = 42
    if (headline.length > cutoff) {
      headline = headline.slice(0, cutoff - 2) + '...'
    }
    const tmpWindow = new ProgressWindow()
    tmpWindow.changeHeadline(headline)
    const icon = 'chrome://zotero/skin/cross.png'
    tmpWindow.progress = new tmpWindow.ItemProgress(icon, text)
    tmpWindow.progress.setError()
    tmpWindow.show()
    tmpWindow.startCloseTimer(time)
    return tmpWindow
  }

  private updateHeadline() {
    const icon = `chrome://zotero/skin/toolbar-advanced-search${Zotero.hiDPI ? '@2x' : ''}.png`
    let headline = 'Default headline'
    switch (this.operation) {
      case Operation.Update:
        headline = getLocalization('MoreProgressWindow.headline.update')
        break
      case Operation.Remove:
        headline = getLocalization('MoreProgressWindow.headline.remove')
        break
      default:
        break
    }
    this.progressWin.changeHeadline(headline, icon)
  }

  private updateText() {
    let text = 'Default text'
    switch (this.operation) {
      case Operation.Update:
        text = getLocalization('MoreProgressWindow.text.update', {
          nDone: this.nDone,
          nAll: this.nAll,
        })
        break
      case Operation.Remove:
        text = getLocalization('MoreProgressWindow.text.remove', {
          nDone: this.nDone,
          nAll: this.nAll,
        })
        break
      default:
        break
    }
    this.setText(text)
  }

  private endWindow(outcome: string) {
    let headline = 'Default headline'
    let icon = ''
    let text = 'Default text'
    switch (outcome) {
      case Operation.Error:
        headline = getLocalization('MoreProgressWindow.end.headline.error')
        icon = 'chrome://zotero/skin/cross.png'
        text = getLocalization('MoreProgressWindow.end.text.error')
        break
      case Operation.Update:
        headline = getLocalization('MoreProgressWindow.end.headline.update')
        icon = 'chrome://zotero/skin/tick.png'
        text = getLocalization('MoreProgressWindow.end.text.update', {
          nSuccess: (this.nDone - this.nFail).toString(),
          nAll: this.nAll.toString(),
        })
        break
      case Operation.Remove:
        headline = getLocalization('MoreProgressWindow.end.headline.remove')
        icon = 'chrome://zotero/skin/tick.png'
        text = getLocalization('MoreProgressWindow.end.text.remove', {
          nSuccess: (this.nDone - this.nFail).toString(),
          nAll: this.nAll.toString(),
        })
        break
      case Operation.Abort:
        headline = getLocalization('MoreProgressWindow.end.headline.abort')
        icon = 'chrome://zotero/skin/cross.png'
        text = getLocalization('MoreProgressWindow.end.text.abort', {
          nSuccess: (this.nDone - this.nFail).toString(),
          nAll: this.nAll.toString(),
        })
        break
      case Operation.Ratelimit:
        headline = getLocalization('MoreProgressWindow.end.headline.ratelimit')
        icon = 'chrome://zotero/skin/cross.png'
        text = getLocalization('MoreProgressWindow.end.text.ratelimit', {
          nSuccess: (this.nDone - this.nFail).toString(),
          nAll: this.nAll.toString(),
        })
        break
      default:
        break
    }
    this.removeAllOneClickFuncs()
    this.progressWin.changeHeadline(headline)
    this.progressWin.progress.setIcon(icon)
    this.progressWin.progress.setText(text)
    if (outcome === Operation.Error) {
      this.progressWin.progress.setError()
    } else {
      this.progressWin.progress.setProgress(100) // tslint:disable-line:no-magic-numbers
    }
    this.progressWin.startCloseTimer(closeTimer)
    this.addOnClickFunc(this.progressWin.close)
  }

  private capitalizeFirstLetter(word) {
    return word.charAt(0).toUpperCase() + word.slice(1)
  }
}
