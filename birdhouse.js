// --------------------------------------------------------
// birdhouse.js
//
// BirdHouse is a Titanium Developer plugin for
// authenticating and sending API calls to Twitter.
//
// Author: Joseph D. Purcell, iEntry Inc.
// Version: 0.2
// Modified: March 2011
// --------------------------------------------------------

// INCLUDES
Ti.include('oauth.js');
Ti.include('sha1.js');

// THE CLASS
function BirdHouse(params) {
	// --------------------------------------------------------
	// ==================== PRIVATE ===========================
	// --------------------------------------------------------
	// VARIABLES
	var cfg = {
		// user config
		oauth_consumer_key: "",
		consumer_secret: "",
		// system config
		oauth_version: "1.0",
		oauth_token: "",
		oauth_signature_method: "HMAC-SHA1",
		request_token: "",
		request_token_secret: "",
		request_verifier: "",
		access_token: "",
		access_token_secret: "",
		callback_url: ""
	};
	var accessor = {
		consumerSecret: cfg.consumer_secret,
		tokenSecret   : cfg.access_token_secret
	};
	var authorized = false;

	// --------------------------------------------------------
	// createMessage
	//
	// Creates a message to send to the Twitter service with
	// the given parameters, and adds the consumer key, 
	// signature method, timestamp, and nonce.
	//
	// In Parameters:
	//	url (String) - the url to send the message to
	//	method (String) - 'POST' or 'GET'
	//	parameters (String) - parameters to add to the
	//	  message in URL form, i.e. var1=2&var2=3
	//
	// Returns:
	//	message (Array) - the message parameters to send
	//	  to Twitter
	// --------------------------------------------------------
	function createMessage(url, method, parameters) {
		var message = {
			action: url,
			method: (method) ? method : 'POST',
			parameters: (parameters) ? OAuth.decodeForm(parameters) : []
		};
		message.parameters.push(['oauth_consumer_key', cfg.oauth_consumer_key]);
		message.parameters.push(['oauth_signature_method', cfg.oauth_signature_method]);
		message.parameters.push(["oauth_timestamp", OAuth.timestamp().toFixed(0)]);
		message.parameters.push(["oauth_nonce", OAuth.nonce(42)]);

		return message;
	}

	// --------------------------------------------------------
	// get_request_token
	//
	// Sets the request token and token secret.
	// --------------------------------------------------------
	function get_request_token() {
		Ti.API.debug('----- Initializing Authorization Sequence -----');

		var url = 'https://api.twitter.com/oauth/request_token';
		if (cfg.callback_url=="") {
			var message = createMessage(url, 'POST', "");
		} else {
			var message = createMessage(url, 'POST', "oauth_callback="+escape(cfg.callback_url));
		}

		OAuth.SignatureMethod.sign(message, accessor);

		Ti.API.debug("fn-get_request_token: the message is " + JSON.stringify(message));

		var finalUrl = OAuth.addToURL(message.action, message.parameters);

		Ti.API.debug("fn-get_request_token: the url is "+finalUrl);

		var XHR = Ti.Network.createHTTPClient();
		
		// on success, grab the request token
		XHR.onload = function() {
			var responseParams = OAuth.getParameterMap(XHR.responseText);
			cfg.request_token = responseParams['oauth_token'];
			cfg.request_token_secret = responseParams['oauth_token_secret'];

			Ti.API.debug("fn-get_request_token: response was "+XHR.responseText);

			get_request_verifier();
		};

		// on error, show message
		XHR.onerror = function(e) {
			Ti.API.debug('fn-get_request_token: XHR request has failed! '+XHR.readyState+' '+e);
		}
		
		XHR.open('POST', finalUrl, false);
		
		XHR.send();
	}

	// --------------------------------------------------------
	// get_request_verifier
	//
	// Sets the request verifier. There is no reason to call
	// this unless you have the request token and token secret.
	// In fact, it should only be called from get_request_token()
	// for that very reason.
	// --------------------------------------------------------
	function get_request_verifier() {
		var url = "http://api.twitter.com/oauth/authorize?oauth_token="+cfg.request_token;
		var webView = Ti.UI.createWebView({
			url: url,
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
			Ti.API.debug("fn-get_request_verifier: Webview has loaded the url: "+webView.url);

			params = "";
			var parts = (webView.url).replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
				params = params + m;

				if (key=='oauth_token') { // why is this here!!!???
					request_token = value;
				} else if (key=='oauth_verifier') {
					cfg.request_verifier = value;
				}
			});
			url_base = (webView.url).replace(params,'');

			Ti.API.debug('fn-get_request_verifier: base url was changed to: '+url_base);

			// success!
			if (url_base == cfg.callback_url) {
				Ti.API.debug("fn-get_request_verifier: response was "+cfg.request_verifier);

				// my attempt at making sure the stupid webview dies
				webView.stopLoading();
				win.remove(webView);
				win.close();

				get_access_token();

				return true; // we are done here
			}
		});

		Ti.API.debug('url is going to: '+url);
	}

	// --------------------------------------------------------
	// get_access_token
	//
	// Trades the request token, token secret, and verifier
	// for a user's access token.
	// --------------------------------------------------------
	function get_access_token() {

		var url = 'https://api.twitter.com/oauth/access_token';

		var message = createMessage(url, 'POST', "oauth_token="+cfg.request_token+"&oauth_verifier="+cfg.request_verifier);

		OAuth.SignatureMethod.sign(message, accessor);

		Ti.API.debug("fn-get_accewss_token: message is " + JSON.stringify(message));

		var finalUrl = OAuth.addToURL(message.action, message.parameters);

		Ti.API.debug('fn-get_access_token: url is '+finalUrl);

		var XHR = Ti.Network.createHTTPClient();
		
		// on success, grab the request token
		XHR.onload = function() {
			var responseParams = OAuth.getParameterMap(XHR.responseText);
			cfg.access_token = responseParams['oauth_token'];
			cfg.access_token_secret = responseParams['oauth_token_secret'];
			cfg.user_id = responseParams['user_id'];
			cfg.screen_name = responseParams['screen_name'];
			accessor.tokenSecret = cfg.access_token_secret;

			Ti.API.debug("fn-get_access_token: response was "+XHR.responseText);

			save_access_token();

			authorized = load_access_token();

			Ti.API.debug("fn-get_access_token: the user is authorized is "+authorized);
		};

		// on error, show message
		XHR.onerror = function(e) {
			Ti.API.debug('fn-get_access_token: XHR request has failed! '+XHR.readyState+' '+e);
		}
		
		XHR.open('GET', finalUrl, false);
		
		XHR.send();
	}

	// --------------------------------------------------------
	// load_access_token
	//
	// Loads the access token and token secret from
	// 'twitter.config' to the class configuration.
	// --------------------------------------------------------
	function load_access_token() {
		// try to find file
		var file = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, 'twitter.config');
		if (!file.exists()) {
			Ti.API.debug("fn-load_access_token: no file found");
			return false;
		}

		// try to read file
		var contents = file.read();
		if (contents == null) {
			Ti.API.debug("fn-load_access_token: file is empty");
			return false;
		}

		// try to parse file into json
		try {
			Ti.API.debug("fn-load_access_token: FILE FOUND\ncontents: "+contents.text);
			var config = JSON.parse(contents.text);
		} catch(e) {
			return false;
		}

		// set config
		if (config.access_token) {
			cfg.access_token = config.access_token;
		}
		if (config.access_token_secret) {
			cfg.access_token_secret = config.access_token_secret;
			accessor.tokenSecret = cfg.access_token_secret;
		}

		return true;
	}

	// --------------------------------------------------------
	// save_access_token
	//
	// Writes the access token and token secret to
	// 'twitter.config'. Saving the config in a file instead
	// of using Ti.App.Property jazz allows the config to
	// stay around even if the app has been recompiled.
	// --------------------------------------------------------
	function save_access_token() {
		// get file if it exists
		var file = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, 'twitter.config');
		// create file if it doesn't exist
		if (file == null) {
			file = Ti.Filesystem.createFile(Ti.Filesystem.applicationDataDirectory, 'twitter.config');
		}

		// write config
		var config = {
			access_token: cfg.access_token,
			access_token_secret: cfg.access_token_secret
		};
		file.write(JSON.stringify(config));

		Ti.API.debug('Saving access token: '+JSON.stringify(config));
	}

	// --------------------------------------------------------
	// api
	//
	// Makes a Twitter API call to the given URL by the
	// specified method with the given parameters.
	//
	// In Parameters:
	//	url (String) - the url to send the XHR to
	//	method (String) - POST or GET
	//	params (String) - the parameters to send in URL
	//	  form
	// --------------------------------------------------------
	function api(url, method, params) {
		Ti.API.debug('----- Initializing API Request Sequence -----');

		// VALIDATE INPUT
		if (method!="POST" && method!="GET") {
			Ti.API.debug("the method given is incorrect: "+method);
			return false;
		}
		var initparams = params;

		params = params + "&oauth_version=1.0&oauth_token="+cfg.access_token;
		var message = createMessage(url, method, params);

		Ti.API.debug('fn-api: accessor is '+JSON.stringify(accessor));
		OAuth.SignatureMethod.sign(message, accessor);

		Ti.API.debug("the API request message: " + JSON.stringify(message));

		var finalUrl = OAuth.addToURL(message.action, initparams);

		Ti.API.debug('api url: '+finalUrl);

		var XHR = Ti.Network.createHTTPClient();
		
		// on success, grab the request token
		XHR.onload = function() {
			Ti.API.debug("The API response was "+XHR.responseText);

			return eval('('+XHR.responseText+')');
		};

		// on error, show message
		XHR.onerror = function(e) {
			// access token and token secret are wrong
			if (e.error=="Unauthorized") {
				Ti.API.debug("API request failed because the access token and token secret must be wrong. Error: "+e);

			} else {
				Ti.API.debug('The API XHR request has failed! '+XHR.readyState+' '+e);
			}

			return false;
		}
		
		XHR.open(method, finalUrl, false);

		// Set the Authorization header for the request
		var init = true;
		var auth = "OAuth ";
		for (var i=0; i<message.parameters.length; i++) {
			if (init) {
				init = false;
			} else {
				auth = auth + ",";
			}
			auth = auth + message.parameters[i][0] + '="' + escape(message.parameters[i][1]) + '"';
		}
		Ti.API.debug('fn-api: auth is '+auth);

		XHR.setRequestHeader("Authorization", auth);
		
		XHR.send();
	}

	// --------------------------------------------------------
	// send_tweet
	//
	// Makes an API call to Twitter to post a tweet.
	//
	// In Parameters:
	//	params (String) - the string of optional and
	//	  required parameters in url form
	// --------------------------------------------------------
	function send_tweet(params) {
		return api("http://api.twitter.com/1/statuses/update.json","POST",params);
	}

	// --------------------------------------------------------
	// get_tweets
	//
	// Makes a TWitter API call to get tweets.
	//
	// In Parameters:
	//	params (String) - the string of optional and
	//	  required parameters in url form
	// --------------------------------------------------------
	function get_tweets(params) {
		return api("https://api.twitter.com/1/statuses/friends_timeline.json","GET",params);
	}

	// --------------------------------------------------------
	// authorize
	//
	// The whole authorization sequence begins with
	// get_request_token(), which calls get_request_verifier()
	// which finally calls get_access_token() which then
	// saves the token in a file.
	// --------------------------------------------------------
	function authorize() {
		get_request_token();
	}

	// --------------------------------------------------------
	// deauthorize
	//
	// Delete the stored access token file, delete the tokens
	// from the config and accessor, and set authorized to
	// load_access_token() which should return false since
	// we deleted the file, thus resulting in a deauthroized
	// state.
	// --------------------------------------------------------
	function deauthorize() {
		var file = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, 'twitter.config');
		file.deleteFile();
		Ti.API.debug("fn-deauthorize: the user is still authorized: "+authorized);
		authorized = load_access_token();
		Ti.API.debug("fn-deauthorize: the user is still authorized: "+authorized);
		accessor.tokenSecret = "";
		cfg.access_token = "";
		cfg.access_token_secret = "";
	}

	// --------------------------------------------------------
	// ===================== PUBLIC ===========================
	// --------------------------------------------------------
	this.authorize = authorize;
	this.deauthorize = deauthorize;
	this.api = api;
	this.authorized = function() { return authorized; }
	this.get_tweets = get_tweets;

	// --------------------------------------------------------
	// tweet
	//
	// Opens a tweet dialog box for the user to make a tweet
	// to their page after checking if the user is authorized
	// with the app. If the user is unauthorized, the
	// authorization process will be initiated first.
	//
	// In Parameters:
	//	text (String) - the default text for the text area
	// --------------------------------------------------------
	this.tweet = function(text) {
		Ti.API.debug("fn-tweet: authorized is: "+authorized);
		if (authorized === false) {
			Ti.API.debug('fn-tweet: we are not authorized, so initiate authorization sequence');
			this.authorize();
		} else {
			Ti.API.debug('fn-tweet: we are authorized, initiate tweet sequence');
			winTW = Ti.UI.createWindow({
				backgroundColor:'#FFF',
				modal:true,
				fullscreen:false,
				height:400,
				top:40
			});
			var tweet = Ti.UI.createTextArea({
				value:text,
				height:200,
				top:10,
				left:10,
				right:10
			});
			var btnTW = Ti.UI.createButton({
				title:'Tweet',
				width:100,
				top:220,
				right:60
			});
			var btnCancel = Ti.UI.createButton({
				title:'Cancel',
				width:100,
				top:220,
				left:60
			});
			btnTW.addEventListener('click',function() {
				var alertDialog = Titanium.UI.createAlertDialog({
					title: 'System Message',
					buttonNames: ['OK']
				});
				var retval = send_tweet("status="+escape(tweet.value));
				if (retval===false) {
					alertDialog.message = "Tweet failed!";
				} else {
					winTW.close();
					alertDialog.message = "Tweet was sent!";
				}
				alertDialog.show();
			});
			btnCancel.addEventListener('click',function() {
				winTW.close();
			});
			winTW.add(tweet);
			winTW.add(btnTW);
			winTW.add(btnCancel);
			winTW.open();
		}
	};

	// --------------------------------------------------------
	// =================== INITIALIZE =========================
	// --------------------------------------------------------
	if (typeof params == 'object') {
		if (params.consumer_key != undefined) {
			cfg.oauth_consumer_key = params.consumer_key;
		}
		if (params.consumer_secret != undefined) {
			cfg.consumer_secret = params.consumer_secret;
			accessor.consumerSecret = cfg.consumer_secret;
		}
		if (params.callback_url != undefined) {
			cfg.callback_url = params.callback_url;
		}
	}
	authorized = load_access_token(); // load the token on startup to see if authorized
	Ti.API.debug("initialization: authorized is "+authorized);
};

