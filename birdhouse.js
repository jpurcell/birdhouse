// --------------------------------------------------------
// birdhouse.js
//
// BirdHouse is a Titanium Developer plugin for
// authenticating and sending API calls to Twitter.
//
// Author: Joseph D. Purcell, iEntry Inc.
// Version: 0.1
// --------------------------------------------------------

// INCLUDES
Ti.include('oauth.js');
Ti.include('sha1.js');

// VARIABLES
var callback_url = "";
var cfg = {
	// user config
	oauth_consumer_key: "",
	consumerSecret: "",
	// system config
	oauth_version: "1.0",
	oauth_token: "",
	oauth_signature_method: "HMAC-SHA1",
	request_token: "",
	request_token_secret: "",
	request_verifier: "",
	access_token: "",
	access_token_secret: "",
	user_id: "",
	screen_name: ""
};
var accessor = {
	consumerSecret: cfg.consumerSecret,
	tokenSecret   : cfg.access_token
};

// --------------------------------------------------------
// createMessage
//
// Creates a message to send to the Twitter service with
// the consumer key and signature method.
//
// In Parameters:
//	pUrl (String) - the url to send the message to
//	method (String) - 'POST' or 'GET'
//	parameters (String) - parameters to add to the
//	  message in URL form, i.e. var1=2&var2=3
//
// Returns:
//	message (Array) - the message parameters to send
//	  to Twitter
// --------------------------------------------------------
function createMessage(pUrl, method, parameters) {
	var message = {
		action: pUrl,
		method: (method) ? method : 'POST',
		parameters: (parameters) ? OAuth.decodeForm(parameters) : []
	};
	message.parameters.push(['oauth_consumer_key', cfg.oauth_consumer_key]);
	message.parameters.push(['oauth_signature_method', cfg.oauth_signature_method]);
	message.parameters.push(["oauth_timestamp", OAuth.timestamp()]);
	message.parameters.push(["oauth_nonce", OAuth.nonce(11)]);

	return message;
};

// --------------------------------------------------------
// get_request_token
//
// Sets the request token and token secret.
//
// In Parameters:
//	accessor (Object) - global variable
//	cfg (Object) - global variable
// --------------------------------------------------------
function get_request_token() {
	var pUrl = 'https://api.twitter.com/oauth/request_token';
	var message = createMessage(pUrl, 'POST', "oauth_callback="+escape(callback_url));

	OAuth.SignatureMethod.sign(message, accessor);

	Ti.API.debug("the message: " + JSON.stringify(message));

	var finalUrl = OAuth.addToURL(message.action, message.parameters);

	var XHR = Ti.Network.createHTTPClient();
	
	// on success, grab the request token
	XHR.onload = function() {
		var responseParams = OAuth.getParameterMap(XHR.responseText);
		cfg.request_token = responseParams['oauth_token'];
		cfg.request_token_secret = responseParams['oauth_token_secret'];

		Ti.API.debug("The rqeuest token response was "+XHR.responseText);

		get_request_verifier();
	};

	// on error, show message
	XHR.onerror = function() {
		Ti.API.debug('The get_request_token XHR request has failed!');
	}
	
	XHR.open('POST', finalUrl, false);
	
	XHR.send();
};

// --------------------------------------------------------
// get_request_verifier
//
// Sets the request verifier. There is no reason to call
// this unless you have the request token and token secret.
// In fact, it should only be called from get_request_token()
// for that very reason.
// --------------------------------------------------------
function get_request_verifier() {
	var pUrl = "http://api.twitter.com/oauth/authorize?oauth_token="+cfg.request_token;
	var webView = Ti.UI.createWebView({
		url: pUrl,
		scalesPageToFit: true,
		touchEnabled: true,
		top:0,
		backgroundColor: '#FFF'
	});
	var request_token = "";
	var url_base = "";
	var params = "";
	var win = Ti.UI.createWindow({
		top: 0,
		modal: true,
		fullscreen: true
	});

	// add the webview to the window and open the window
	win.add(webView);
	win.open();

	// on url change, see if we've hit the callback
	webView.addEventListener('load',function(){
		Ti.API.debug("Webview has loaded the url: "+webView.url);

		params = "";
		var parts = (webView.url).replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
			params = params + m;

			if (key=='oauth_token') {
				request_token = value;
			} else if (key=='oauth_verifier') {
				cfg.request_verifier = value;
			}
		});
		url_base = (webView.url).replace(params,'');

		Ti.API.debug('base url was changed to: '+url_base);

		// success!
		if (url_base == callback_url) {
			Ti.API.debug("request token is "+request_token);
			Ti.API.debug("request verifier is "+cfg.request_verifier);

			// my attempt at making sure the stupid webview dies
			webView.stopLoading();
			win.remove(webView);
			win.close();

			get_access_token();

			return true; // we are done here
		}
	});

	Ti.API.debug('url is going to: '+pUrl);
}

// --------------------------------------------------------
// get_access_token
//
// Trades the request token, token secret, and verifier
// for a user's access token.
//
// In Parameters:
//	accessor (Object) - global variable
//	cfg (Object) - global variable
// --------------------------------------------------------
function get_access_token() {
	Ti.API.debug("YAY! We are now on the third step--getting the user's oauth token");

	var pUrl = 'https://api.twitter.com/oauth/access_token';

	var message = createMessage(pUrl, 'POST', "oauth_token="+cfg.request_token+"&oauth_verifier="+cfg.request_verifier);

	OAuth.SignatureMethod.sign(message, accessor);

	Ti.API.debug("the get_access_token message: " + JSON.stringify(message));

	var finalUrl = OAuth.addToURL(message.action, message.parameters);

	Ti.API.debug('access_token url: '+finalUrl);

	var XHR = Ti.Network.createHTTPClient();
	
	// on success, grab the request token
	XHR.onload = function() {
		var responseParams = OAuth.getParameterMap(XHR.responseText);
		cfg.access_token = responseParams['oauth_token'];
		cfg.access_token_secret = responseParams['oauth_token_secret'];
		cfg.user_id = responseParams['user_id'];
		cfg.screen_name = responseParams['screen_name'];
		accessor.tokenSecret = cfg.access_token;

		Ti.API.debug("The access token response was "+XHR.responseText);
	};

	// on error, show message
	XHR.onerror = function() {
		Ti.API.debug('The get_access_token XHR request has failed!');
	}
	
	XHR.open('GET', finalUrl, false);
	
	XHR.send();
}

// --------------------------------------------------------
// MAIN
// --------------------------------------------------------
// get request token
get_request_token();

