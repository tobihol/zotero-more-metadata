// Only create main object once
let loader = Components.classes['@mozilla.org/moz/jssubscript-loader;1']
					.getService(Components.interfaces.mozIJSSubScriptLoader);
let scripts = ['webpack','MASMetaData'];
scripts.forEach(s => loader.loadSubScript('chrome://zotero-mas-metadata/content/' + s + '.js'));