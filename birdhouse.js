// --------------------------------------------------------
// birdhouse.js
//
// BirdHouse is a Titanium Developer plugin for
// authenticating and sending API calls to Twitter.
//
// Author: Joseph D. Purcell, iEntry Inc.
// Version: 0.3
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
	//
	// In Parameters:
	//	callback (Function) - a function to call after
	//	  the user has been authorized; note that it won't
	//	  be executed until get_access_token()
	// --------------------------------------------------------
	function get_request_token(callback) {
		var url = 'https://api.twitter.com/oauth/request_token';
		if (cfg.callback_url=="") {
			var message = createMessage(url, 'POST', "");
		} else {
			var message = createMessage(url, 'POST', "oauth_callback="+escape(cfg.callback_url));
		}

		OAuth.SignatureMethod.sign(message, accessor);

		var finalUrl = OAuth.addToURL(message.action, message.parameters);

		var XHR = Ti.Network.createHTTPClient();
		
		// on success, grab the request token
		XHR.onload = function() {
			var responseParams = OAuth.getParameterMap(XHR.responseText);
			cfg.request_token = responseParams['oauth_token'];
			cfg.request_token_secret = responseParams['oauth_token_secret'];

			get_request_verifier(callback);
		};

		// on error, show message
		XHR.onerror = function(e) {
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
	//
	// In Parameters:
	//	callback (Function) - a function to call after
	//	  the user has been authorized; note that it won't
	//	  be executed until get_access_token()
	// --------------------------------------------------------
	function get_request_verifier(callback) {
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

		// on url change, see if 'oauth_verifier' is in the url
		webView.addEventListener('load',function(){
			params = "";
			var parts = (webView.url).replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
				params = params + m;

				if (key=='oauth_verifier') {
					cfg.request_verifier = value;
				}
			});

			// success!
			if (cfg.request_verifier!="") {
				// my attempt at making sure the stupid webview dies
				webView.stopLoading();
				win.remove(webView);
				win.close();

				get_access_token(callback);

				return true; // we are done here
			}
		});
	}

	// --------------------------------------------------------
	// get_access_token
	//
	// Trades the request token, token secret, and verifier
	// for a user's access token.
	//
	// In Parameters:
	//	callback (Function) - a function to call after
	//	  the user has been authorized; this is where
	//	  it will get executed after being authorized
	// --------------------------------------------------------
	function get_access_token(callback) {

		var url = 'https://api.twitter.com/oauth/access_token';

		var message = createMessage(url, 'POST', "oauth_token="+cfg.request_token+"&oauth_verifier="+cfg.request_verifier);

		OAuth.SignatureMethod.sign(message, accessor);

		var finalUrl = OAuth.addToURL(message.action, message.parameters);

		var XHR = Ti.Network.createHTTPClient();
		
		// on success, grab the request token
		XHR.onload = function() {
			var responseParams = OAuth.getParameterMap(XHR.responseText);
			cfg.access_token = responseParams['oauth_token'];
			cfg.access_token_secret = responseParams['oauth_token_secret'];
			cfg.user_id = responseParams['user_id'];
			cfg.screen_name = responseParams['screen_name'];
			accessor.tokenSecret = cfg.access_token_secret;

			save_access_token();

			authorized = load_access_token();

			// execute the callback function
			if(authorized && typeof(callback)=='function'){
				callback();
			}
		};

		// on error, show message
		XHR.onerror = function(e) {
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
			return false;
		}

		// try to read file
		var contents = file.read();
		if (contents == null) {
			return false;
		}

		// try to parse file into json
		try {
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
		// authorize user if not authorized, and call this in the callback
		if (!authorized) {
			authorize(function(){
				api(url,method,params);
			});
		}
		// user is authorized so execute API
		else {
			// VALIDATE INPUT
			if (method!="POST" && method!="GET") {
				return false;
			}
			if (params==null || typeof(params)=="undefined") {
				params = "";
			}

			// VARIABLES
			var initparams = params;

			params = params + "&oauth_version=1.0&oauth_token="+cfg.access_token;
			var message = createMessage(url, method, params);
			OAuth.SignatureMethod.sign(message, accessor);

			var finalUrl = OAuth.addToURL(message.action, initparams);

			var XHR = Ti.Network.createHTTPClient();
			
			// on success, grab the request token
			XHR.onload = function() {
				return true;
			};

			// on error, show message
			XHR.onerror = function(e) {
				// access token and token secret are wrong
				if (e.error=="Unauthorized") {
				} else {
				}

				return false;
			}
			
			XHR.open(method, finalUrl, false);

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

			XHR.setRequestHeader("Authorization", auth);
			
			XHR.send();
		}
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
	//
	// In Parameters:
	//	callback (Function) - a function to call after
	//	  the user has been authorized; note that it won't
	//	  be executed until get_access_token()
	// --------------------------------------------------------
	function authorize(callback) {
		get_request_token(callback);
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
		authorized = load_access_token();
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
		if (authorized === false) {
			this.authorize();
		} else {
			var chars = text.length;
			var winBG = Titanium.UI.createWindow({
				backgroundColor:'#000',
				opacity:0.60
			});
			var winTW = Titanium.UI.createWindow({
				height:304,
				top:10,
				right:10,
				left:10,
				borderColor:'#224466',
				borderWidth:3,
				backgroundColor:'#559abb',
				borderRadius:3.0
			});
			var tweet = Ti.UI.createTextArea({
				value:text,
				height:200,
				top:14,
				left:14,
				right:14
			});
			var btnTW = Ti.UI.createButton({
				title:'Tweet',
				width:100,
				top:222,
				right:24
			});
			var btnCancel = Ti.UI.createButton({
				title:'Cancel',
				width:100,
				top:222,
				left:24
			});
			var charcount = Ti.UI.createLabel({
				bottom:10,
				right:14,
				color:'#FFF',
				text:parseInt((140-text.length))+''
			});
			tweet.addEventListener('change',function() {
				chars = (140-this.value.length);
				if (chars<11) {
					if (charcount.color!='#D40D12') {
						charcount.color = '#D40D12';
					}
				} else if (chars<20) {
					if (charcount.color!='#5C0002') {
						charcount.color = '#5C0002';
					}
				} else {
					if (charcount.color!='#FFF') {
						charcount.color = '#FFF';
					}
				}
				charcount.text = parseInt(chars)+'';
			});
			btnTW.addEventListener('click',function() {
				var retval = send_tweet("status="+escape(tweet.value));
				if (retval===false) {
					var alertDialog = Titanium.UI.createAlertDialog({
						title: 'System Message',
						buttonNames: ['OK']
					});
					alertDialog.message = "Tweet failed to send!";
				} else {
					winBG.close();
					winTW.close();
				}
			});
			btnCancel.addEventListener('click',function() {
				winBG.close();
				winTW.close();
			});
			winTW.add(charcount);
			winTW.add(tweet);
			winTW.add(btnTW);
			winTW.add(btnCancel);
			winBG.open();
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
};

