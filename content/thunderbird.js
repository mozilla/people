
function peopleClickHandler(aEvent, aSiteRegexp) {
   // XXX this is experimenting with a click handler override for the
   // thunderbird special tabs, it will go away after I've played more.
   
   // Don't handle events that: a) aren't trusted, b) have already been
   // handled or c) aren't left-click.
   if (!aEvent.isTrusted || aEvent.getPreventDefault() || aEvent.button)
     return true;
   
   let href = hRefForClickEvent(aEvent, true);
   // We've explicitly allowed http, https and about as additional exposed
   // protocols in our default prefs, so these are the ones we need to check
   // for here.
   if (href) {
      let _protocolSvc =
               Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                         .getService(Components.interfaces.nsIExternalProtocolService);

     let uri = makeURI(href);
     if (!_protocolSvc.isExposedProtocol(uri.scheme) ||
         ((uri.schemeIs("http") || uri.schemeIs("https") ||
           uri.schemeIs("about")) && !aSiteRegexp.test(uri.spec))) {
       aEvent.preventDefault();
       openLinkExternally(href);
     }
   }
}

function peopleAuthRequest(url, browserListener) {
   let tab = document.getElementById('tabmail')
       .openTab('contentTab', { contentPage: url,
                                clickHandler: 'peopleClickHandler(event,/javascript/);' });
   if (browserListener)
      tab.browser.addProgressListener(browserListener, 
                                      Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
}

