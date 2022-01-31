// Only create main object once
let loader = Components.classes['@mozilla.org/moz/jssubscript-loader;1']
					.getService(Components.interfaces.mozIJSSubScriptLoader);
let scripts = ['webpack','MoreMetaData'];
scripts.forEach(s => loader.loadSubScript('chrome://zotero-more-metadata/content/' + s + '.js'));