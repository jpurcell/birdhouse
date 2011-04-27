// --------------------------------------------------------
// birdhouse-debug.js
//
// BirdHouse is a Titanium Developer plugin for
// authenticating and sending API calls to Twitter.
//
// Copyright 2011 (c) iEntry, Inc
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//     http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Joseph D. Purcell, iEntry Inc
// Version: 0.7
// Modified: April 2011
// --------------------------------------------------------

// INCLUDES
// iphone requires complete path
if (Ti.Platform.osname=='iphone') {
	Ti.include('lib/oauth.js');
	Ti.include('lib/sha1.js');
}
// android will search the current directory for files
else {
	Ti.include('oauth.js');
	Ti.include('sha1.js');
}

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
	// var_dump
	//
	// A handy function for printing out data for debugging.
	// --------------------------------------------------------
	function var_dump(obj) {
		var out = '';
		var yes = false;

		for (var i in obj) {
			out = i+' ('+typeof(obj)+'):'+ obj[i];
			yes = true; // we has properties!
		}

		if (yes) {
			Ti.API.info('var_dump: '+out);
		} else {
			Ti.API.info('var_dump: obj '+typeof(obj)+' has no properties'+JSON.stringify(obj));
		}
	}

	// --------------------------------------------------------
	// set_message
	//
	// Creates a message to send to the Twitter service with
	// the given parameters, and adds the consumer key, 
	// signature method, timestamp, and nonce.
	//
	// In Parameters:
	//	url (String) - the url to send the message to
	//	method (String) - 'POST' or 'GET'
	//	params (String) - parameters to add to the
	//	  message in URL form, i.e. var1=2&var2=3
	//
	// Returns:
	//	message (Array) - the message parameters to send
	//	  to Twitter
	// --------------------------------------------------------
	function set_message(url, method, params) {
		var message = {
			action: url,
			method: (method=='GET') ? method : 'POST',
			parameters: (params!=null) ? OAuth.decodeForm(params) : []
		};
		message.parameters.push(['oauth_consumer_key', cfg.oauth_consumer_key]);
		message.parameters.push(['oauth_signature_method', cfg.oauth_signature_method]);
		message.parameters.push(["oauth_timestamp", OAuth.timestamp().toFixed(0)]);
		message.parameters.push(["oauth_nonce", OAuth.nonce(42)]);
		message.parameters.push(["oauth_version", "1.0"]);

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

		var params = (cfg.callback_url!="")?'oauth_callback='+escape(cfg.callback_url):'';

		api(url,'POST',params,function(resp){
			if (resp!=false) {
				var responseParams = OAuth.getParameterMap(resp);
				cfg.request_token = responseParams['oauth_token'];
				cfg.request_token_secret = responseParams['oauth_token_secret'];

				Ti.API.debug("fn-get_request_token: response was "+resp);
				Ti.API.debug("fn-get_request_token: config is now "+JSON.stringify(cfg));
				Ti.API.debug("fn-get_request_token: callback is "+JSON.stringify(callback));

				get_request_verifier(callback);
			} else {
				Ti.API.info("Failed to authorized.");
			}
		},false,true,false);
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
		var compareUrl = ""; // used for iOS
		var win = Ti.UI.createWindow({
			top: 0,
			modal: true,
			fullscreen: true
		});
		var init = true;
		var allow = false;
		var title = '';

		// add the webview to the window and open the window
		win.add(webView);
		win.open();

		webView.addEventListener('load',function(e){
			title = webView.evalJS("document.title");

			Ti.API.info('1: '+webView.evalJS("document.getElementById('content').innerHTML"));
			Ti.API.info('2: '+webView.evalJS("document.referrer"));
			Ti.API.info('3: '+webView.evalJS("document.title"));
			Ti.API.info('4: '+e.url);
			// the first time load, ignore
			if (init) {
				Ti.API.debug('skip initial load');
				init = false
			}
			// the second load they have clicked allow or deny
			else {
				Ti.API.info('no longer init');
				//if (webView.evalJS("document.title")=="Twitter / Redirecting you back to the application") {
				//if (!wait && webView.evalJS("document.title")!="Twitter") {

				// listen for the tokenses if "allow" was clicked
				if (allow) {
					Ti.API.info('listen for tokens in url');

					// success!
					params = "";
					var parts = (e.url).replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
						params = params + m;

						if (key=='oauth_verifier') {
							cfg.request_verifier = value;
						}
					});

					if (cfg.request_verifier!="") {
						Ti.API.debug("fn-get_request_verifier: response was "+cfg.request_verifier);

						// my attempt at making sure the stupid webview dies
						Ti.API.info('loading1: '+webView.loading);
						webView.stopLoading();
						Ti.API.info('loading2: '+webView.loading);
						win.remove(webView);
						win.close();

						get_access_token(callback);

						return true; // we are done here
					}
				}
				// find out what the user is clicking on
				else {

					// user is creating a new account (goes to a suspended page if clicked second time)
					// just kill the auth process and say "go do this somewhere else"
					if ((e.url).search('account')!=-1 || (e.url).search('suspended')!=-1) {
						Ti.API.info('----WE ARE CREATING AN ACCOUNT!----');

						webView.stopLoading();
						win.remove(webView);
						win.close();

						if(typeof(callback)=='function'){
							callback(false);
						}

						return false;
					}
					// access denied was clicked
					//else if ((webView.evalJS("document.title")).search('Redirect')==-1) {
					else if (title=='Twitter') {
						Ti.API.info('----ACCESS DENIED!!!!----');

						webView.stopLoading();
						win.remove(webView);
						win.close();

						if(typeof(callback)=='function'){
							callback(false);
						}

						return false;
					}
					// allow access was clicked
					else {
						// note that we can skip the current page, because the page
						// is a page on Twitter with a javscript (or PHP) redirect
						// when webView load fires again, allow will be true
						// and we will extract the tokenses
						Ti.API.info('----SUCCESS!----');
						allow = true;

						Ti.API.info('listen for tokens in url');

						// go ahead and check this page for the tokens
						params = "";
						var parts = (e.url).replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
							params = params + m;

							if (key=='oauth_verifier') {
								cfg.request_verifier = value;
							}
						});

						if (cfg.request_verifier!="") {
							Ti.API.debug("fn-get_request_verifier: response was "+cfg.request_verifier);

							// my attempt at making sure the stupid webview dies
							webView.stopLoading();
							win.remove(webView);
							win.close();

							get_access_token(callback);

							return true; // we are done here
						}
					}
				}
			}
		});

		Ti.API.debug('url is going to: '+url);
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

		api(url,'POST','oauth_token='+cfg.request_token+'&oauth_verifier='+cfg.request_verifier,function(resp){
			if (resp!=false) {
				var responseParams = OAuth.getParameterMap(resp);
				cfg.access_token = responseParams['oauth_token'];
				cfg.access_token_secret = responseParams['oauth_token_secret'];
				cfg.user_id = responseParams['user_id'];
				cfg.screen_name = responseParams['screen_name'];
				accessor.tokenSecret = cfg.access_token_secret;

				Ti.API.debug("fn-get_access_token: response was "+resp);

				save_access_token();

				authorized = load_access_token();

				Ti.API.debug("fn-get_access_token: the user is authorized is "+authorized);

				Ti.API.info('Authorization is complete. The callback fn is: '+JSON.stringify(callback));

				// execute the callback function
				if(typeof(callback)=='function'){
					Ti.API.debug("fn-get_access_token: we are calling a callback function");
					callback(true);
				}
			} else {
				Ti.API.info("Failed to get access token.");
				// execute the callback function
				if(typeof(callback)=='function'){
					Ti.API.debug("fn-get_access_token: we are calling a callback function");
					callback(false);
				}
			}
		},false,true,false);
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
	//	callback (Function) - after execution, call
	//	  this function and send the XHR data to it
	//	auth (Bool) - whether or not to force auth
	//	setUrlParams (Bool) - set the params in the URL
	//	setHeader (Bool) - set "Authorization" HTML header
	//
	// Notes:
	//	- the setUrlParams and setHeader should only need
	//	  to be set whenever getting request tokens; values
	//	  should be 'true' and 'false' respectively
	//	- take advantage of the callback function, if you
	//	  want to tweet a message and then display an alert:
	//	      BH.tweet("some text",function(){
	//	          alertDialog = Ti.UI.createAlertDialog({
	//	              message:'Tweet posted!'
	//	          });
	//	          alertDialog.show();
	//	      });
	//
	// Returns: false on failure and the responseText on
	//   success.
	// --------------------------------------------------------
	function api(url, method, params, callback, auth, setUrlParams, setHeader) {
		var finalUrl = '';

		Ti.API.debug('fn-api: callback sent is '+JSON.stringify(callback));
		Ti.API.debug('fn-api: force authorization is '+(typeof(auth)=='undefined' || auth===true));
		// authorize user if not authorized, and call this in the callback
		if (!authorized && (typeof(auth)=='undefined' || auth===true)) {
			Ti.API.info('fn-api: need to authorize b/c we are not');
			authorize(function(retval){
				if (!retval) {
					Ti.API.info('fn-api: we have returned from authorizing, but auth is false, so return false & dont execute API');
					// execute the callback function
					if (typeof(callback)=='function') {
						Ti.API.info('CALLBACK SEND: FALSE');
						callback(false);
					}

					return false;
				} else {
					Ti.API.info('fn-api: we have returned from authorizing & we are authorized!');
					api(url,method,params,callback,auth);
				}
			});
		}
		// user is authorized so execute API
		else {
			Ti.API.info('----- Initializing API Request Sequence -----');

			// VALIDATE INPUT
			if (method!="POST" && method!="GET") {
				Ti.API.debug("the method given is incorrect: "+method);
				return false;
			}
			if (params==null || typeof(params)=="undefined") {
				params = "";
			}

			// VARIABLES
			var initparams = params;

			if (params!=null) {
				params = params + "&";
			}

			Ti.API.debug("access_token is "+cfg.access_token+" typof: "+typeof(cfg.access_token));
			if (cfg.access_token!='') {
				params = params + "oauth_token="+cfg.access_token;
			}
			var message = set_message(url, method, params);
			//var message = createMessage(url, method, params);

			Ti.API.debug('fn-api: accessor is '+JSON.stringify(accessor));
			OAuth.SignatureMethod.sign(message, accessor);

			Ti.API.debug("the API request message: " + JSON.stringify(message));

			// if we are getting request tokens, all params have to be set in URL
			if (typeof(setUrlParams)!='undefined' && setUrlParams==true) {
				finalUrl = OAuth.addToURL(message.action, message.parameters);
			}
			// for all other requests only custom params need set in the URL
			else {
				finalUrl = OAuth.addToURL(message.action, initparams);
			}

			Ti.API.debug('api url: '+finalUrl);

			var XHR = Ti.Network.createHTTPClient();
			
			// on success, grab the request token
			XHR.onload = function() {
				Ti.API.debug("The API response was "+XHR.responseText);

				// execute the callback function
				if (typeof(callback)=='function') {
					Ti.API.debug("fn-api: we are calling a callback function");
					callback(XHR.responseText);
				} else {
					Ti.API.debug("fn-api: no callback set");
				}

				return XHR.responseText;
			};

			// on error, show message
			XHR.onerror = function(e) {
				// access token and token secret are wrong
				if (e.error=="Unauthorized") {
					Ti.API.debug("API request failed because the access token and token secret must be wrong. Error: "+e);

				} else {
					Ti.API.debug('The API XHR request has failed! Status='+XHR.readyState+' and var_dump of e is '+var_dump(e));
				}

				return false;
			}
			
			XHR.open(method, finalUrl, false);

			// if we are getting request tokens do not set the HTML header
			if (typeof(setHeader)=='undefined' || setHeader==true) {
				var init = true;
				var header = "OAuth ";
				for (var i=0; i<message.parameters.length; i++) {
					if (init) {
						init = false;
					} else {
						header = header + ",";
					}
					header = header + message.parameters[i][0] + '="' + escape(message.parameters[i][1]) + '"';
				}
				Ti.API.debug('fn-api: auth is '+header);

				XHR.setRequestHeader("Authorization", header);
			}
			
			XHR.send();
		}
	}

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
	//	callback (Function) - function to use on callback
	// --------------------------------------------------------
	function tweet(text,callback) {
		// VALIDATE INPUT
		// just in case someone only wants to send a callback
		if (typeof(text)=='function' && typeof(callback)=='undefined') {
			callback = text;
			text = '';
		}
		if (typeof(text)=='undefined') {
			text = '';
		}

		Ti.API.info('----- Opening Tweet UI -----');
		var obj = this;
		obj.mytweet = text;
		Ti.API.debug("fn-tweet: authorized is: "+authorized);
		if (authorized === false) {
			Ti.API.debug('fn-tweet: we are not authorized, so initiate authorization sequence');
			authorize(function(resp){
				if (resp) {
					Ti.API.info('alright, we can tweet now: typeof '+JSON.stringify(tweet));
					obj.tweet(obj.mytweet);

					return true;
				} else {
					Ti.API.debug("fn-tweet: after asking for authorization, we didn't authorize, so we can't send the tweet.");

					// execute the callback function
					if (typeof(callback)=='function') {
						Ti.API.info('CALLBACK 0-false');
						callback(false);
					}

					return false;
				}
			});
		} else {
			Ti.API.debug('fn-tweet: we are authorized, initiate tweet sequence');
			var chars = (typeof(text)!='undefined' && text!=null)?text.length:0;

			var winBG = Titanium.UI.createWindow({
				backgroundColor:'#000',
				opacity:0.60
			});

			// the UI window looks completely different on iPhone vs. Android
			// iPhone UI
			if (Ti.Platform.osname=='iphone') {
				var winTW = Titanium.UI.createWindow({
					height:((Ti.Platform.displayCaps.platformHeight*0.5)-15), // half because the keyboard takes up half
					width:(Ti.Platform.displayCaps.platformWidth-20),
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
					height:((Ti.Platform.displayCaps.platformHeight*0.5)-100),
					width:(Ti.Platform.displayCaps.platformWidth-48),
					font:{fontSize:16},
					top:14,
					left:14,
					right:14
				});
				var btnTW = Ti.UI.createButton({
					title:'Tweet!',
					width:100,
					height:30,
					top:((Ti.Platform.displayCaps.platformHeight*0.5)-75),
					right:24
				});
				var btnCancel = Ti.UI.createButton({
					title:'Cancel',
					width:100,
					height:30,
					top:((Ti.Platform.displayCaps.platformHeight*0.5)-75),
					left:24
				});
				var charcount = Ti.UI.createLabel({
					top:((Ti.Platform.displayCaps.platformHeight*0.5)-55),
					left:(Ti.Platform.displayCaps.platformWidth-60), // 30 px from right side,
					color:'#FFF',
					text:(parseInt((140-chars))+'')
				});
			}
			// Android UI
			else {
				var winTW = Titanium.UI.createWindow({
					height:264,
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
					height:160,
					top:14,
					left:14,
					right:14
				});
				var btnTW = Ti.UI.createButton({
					title:'Tweet',
					width:100,
					top:182,
					right:24
				});
				var btnCancel = Ti.UI.createButton({
					title:'Cancel',
					width:100,
					top:182,
					left:24
				});
				var charcount = Ti.UI.createLabel({
					bottom:10,
					right:14,
					color:'#FFF',
					text:(parseInt((140-chars))+'')
				});
			}
			tweet.addEventListener('change',function(e) {
				chars = (140-e.value.length);
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

					// execute the callback function
					if (typeof(callback)=='function') {
						Ti.API.info('CALLBACK 1-false');
						callback(false);
					}

					return false;
				} else {
					// hide the keyboard on Android because it doesn't automatically
					if (Ti.Platform.osname=='android') {
						Titanium.UI.Android.hideSoftKeyboard();
					}

					// execute the callback function
					if (typeof(callback)=='function') {
						Ti.API.info('CALLBACK 1-true');
						callback(false);
					}

					winBG.close();
					winTW.close();

					return true;
				}
			});
			btnCancel.addEventListener('click',function() {
				// hide the keyboard on Android because it doesn't automatically
				if (Ti.Platform.osname=='android') {
					Titanium.UI.Android.hideSoftKeyboard();
				}
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
		api('http://api.twitter.com/1/statuses/update.json','POST',params,function(resp){
			if (resp!=false) {
				Ti.API.debug("fn-send_tweet: response was "+resp);
				return true;
			} else {
				Ti.API.info("Failed to send tweet.");
				return false;
			}
		});
	}

	// --------------------------------------------------------
	// get_tweets
	//
	// Makes a TWitter API call to get tweets.
	//
	// In Parameters:
	//	params (String) - the string of optional and
	//	  required parameters in url form
	//	callback (Function) - function to use on callback
	// --------------------------------------------------------
	function get_tweets(params,callback) {
		// just in case someone only wants to send a callback
		if (typeof(params)=='function' && typeof(callback)=='undefined') {
			callback = params;
			params = '';
		}

		api("https://api.twitter.com/1/statuses/friends_timeline.json","GET",params,function(tweets){
			try {
				tweets = JSON.parse(tweets);
			} catch (e) {
				Ti.API.info('fn-get_tweets: api returned a non-JSON string');
				tweets = false;
			}

			if (tweets!=false) {
				Ti.API.info('fn-get_tweets: WE GOT TWEETS!');
			}

			// execute the callback function
			if(typeof(callback)=='function'){
				callback(tweets);
			}

			return tweets;
		})
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
	//	  be executed until get_access_token(), unless we
	//	  are already authorized.
	//
	// Returns: true if the user is authorized
	// --------------------------------------------------------
	function authorize(callback) {
		if (!authorized) {
			Ti.API.info('----- Initializing Authorization Sequence -----');
			Ti.API.debug("fn-authorize: use this callback function: "+JSON.stringify(callback));
			get_request_token(callback); // get_request_token or a function it calls will call callback

		} else {
			var alertDialog = Titanium.UI.createAlertDialog({
				title: 'Error Message',
				message: 'You are already authorized!',
				buttonNames: ['Schweet!']
			});
			alertDialog.show();

			// execute the callback function
			if(typeof(callback)=='function'){
				callback(authorized);
			}
		}

		return authorized;
	}

	// --------------------------------------------------------
	// deauthorize
	//
	// Delete the stored access token file, delete the tokens
	// from the config and accessor, and set authorized to
	// load_access_token() which should return false since
	// we deleted the file, thus resulting in a deauthroized
	// state.
	//
	// In Parameters:
	//	callback (Function) - function to call after
	//	  user is deauthorized
	//
	// Returns: true if the user is deauthorized
	// --------------------------------------------------------
	function deauthorize(callback) {
		if (authorized) {
			Ti.API.info('----- Initializing Deauthorization Sequence -----');
			var file = Ti.Filesystem.getFile(Ti.Filesystem.applicationDataDirectory, 'twitter.config');
			file.deleteFile();
			Ti.API.debug("fn-deauthorize: the user is still authorized: "+authorized);
			authorized = load_access_token();
			Ti.API.debug("fn-deauthorize: the user is still authorized: "+authorized);
			accessor.tokenSecret = "";
			cfg.access_token = "";
			cfg.access_token_secret = "";
			cfg.request_verifier = "";

			// execute the callback function
			if(typeof(callback)=='function'){
				callback(!authorized);
			}
		} else {
			var alertDialog = Titanium.UI.createAlertDialog({
				title: 'Error Message',
				message: 'You are already deauthorized!',
				buttonNames: ['Oh, OK']
			});
			alertDialog.show();

			// execute the callback function
			if(typeof(callback)=='function'){
				callback(!authorized);
			}
		}

		return !authorized;
	}

	// --------------------------------------------------------
	// ===================== PUBLIC ===========================
	// --------------------------------------------------------
	this.authorize = authorize;
	this.deauthorize = deauthorize;
	this.api = api;
	this.authorized = function() { return authorized; }
	this.get_tweets = get_tweets;
	this.tweet = tweet;

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

