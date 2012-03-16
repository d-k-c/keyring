/**
 * Copyright (c) 2010 - 2011 by Eric Van Dewoestine
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 * Plugin to pull username/password from gnome-keyring for logging onto sites.
 *
 * Usage:
 *   :keyring login
 *      Attempt to find the username/password fields and populate them.
 *   :keyring username
 *      Populate the current (or last) focused input with the username.
 *   :keyring password
 *      Populate the current (or last) focused password input with the password.
 *      Note: this will only populate the input if it is of type 'password'.
 */
function Keyring() {
  function paste(arg){
    try{
      var inputField = window.content.document.lastInputField;
      if (!inputField){
        return;
      }

      var clip = Components.classes["@mozilla.org/widget/clipboard;1"]
        .getService(Components.interfaces.nsIClipboard);
      if (!clip){
        Firebug.Console.log('Failed to aquire the clipboard.');
        return;
      }

      var trans = Components.classes["@mozilla.org/widget/transferable;1"]
        .createInstance(Components.interfaces.nsITransferable);
      if (!trans){
        Firebug.Console.log('Failed to aquire the transferable.');
        return;
      }
      trans.addDataFlavor("text/unicode");
      clip.getData(trans, clip.kGlobalClipboard);
      var str = new Object();
      var strLength = new Object();
      trans.getTransferData("text/unicode", str, strLength);

      if (!str) {
        Firebug.Console.log('No content retrieved from the clipboard.');
        return;
      }

      str = str.value.QueryInterface(Components.interfaces.nsISupportsString);
      var value= str.data.substring(0, strLength.value / 2);
      inputField.value = value;
      if (arg == 'username'){
        window.content.document.username = value;
      }
    }catch(e){
      Firebug.Console.log(e);
    }
  }

  function KeyringObserver(arg) {
    this.register();
    this.arg = arg;
  }
  KeyringObserver.prototype = {
    observe: function(subject, topic, data) {
      paste(this.arg);
    },
    register: function() {
      var observerService =
        Components.classes["@mozilla.org/observer-service;1"]
          .getService(Components.interfaces.nsIObserverService);
      observerService.addObserver(this, "keyring", false);
    }
  }
  var observers = {
    'username': new KeyringObserver('username'),
    'password': new KeyringObserver('password')
  };

  function execute(args){
    try{
      var dirService =
        Components.classes["@mozilla.org/file/directory_service;1"]
          .getService(Components.interfaces.nsIProperties);
      var homeDirFile = dirService.get("Home", Components.interfaces.nsIFile);
      var homeDir = homeDirFile.path;

      var file = Components.classes["@mozilla.org/file/local;1"]
        .createInstance(Components.interfaces.nsILocalFile);
      file.initWithPath(homeDir + '/bin/keyring');
      var process = Components.classes["@mozilla.org/process/util;1"]
        .createInstance(Components.interfaces.nsIProcess);
      var observer = observers[args[0]];
      args.unshift('-c');
      process.init(file);
      Firebug.Console.log(args);
      process.runAsync(args, args.length, observer);
    }catch(e){
      Firebug.Console.log(e);
    }
  }

  function hostname(document, args){
    var domain = args && args.length ? args[0] : '';
    if (domain){
      return domain;
    }

    var host = document.location.hostname;
    var remove = /^(www\d*|wwws|us|login|sitekey|secure)\./;
    if (remove.test(host)){
      host = host.replace(remove, '');
    }
    return host;
  }

  function findPasswordInput(root){
    var passInputs = root.querySelectorAll('input[type=password]');

    for(var i = 0; i < passInputs.length; i++){
      if (isVisible(passInputs[i])){
        return passInputs[i];
      }
    }

    if (root == window.content.document){
      var frames = root.querySelectorAll('iframe');
      for (var i = 0; i < frames.length; i++){
        passInput = findPasswordInput(frames[i].contentWindow.document);
        if (passInput){
          return passInput;
        }
      }
    }
    return null;
  }

  function isVisible(input){
    var node = input
    while(node){
      if(node.nodeName.toLowerCase() == 'body'){
        return true;
      }
      if(node.style.display == 'none' || node.style.visibility == 'hidden'){
        return false;
      }
      node = node.parentNode;
    }
    return true;
  }

  return {
    login: function(args){
      var passInput = findPasswordInput(window.content.document);
      if (!passInput){
        liberator.echoerr('No password input found.');
        return;
      }

      var node = passInput.parentNode;
      var userInput = null;
      while (node != document){
        userInput = node.querySelector('input[type=email], input[type=text]');
        if (userInput){
          break;
        }
        node = node.parentNode;
      }

      if (!userInput){
        liberator.echoerr('No user input found.');
        return;
      }
      Firebug.Console.log(['username', userInput]);
      Firebug.Console.log(['password', passInput]);
      keyring['username'](args, userInput);
      // hacky... is there a better way to wait for completion of the username
      // step?
      setTimeout(function(){
        if (window.content.document.username){
          keyring['password'](args, passInput);
        }
      }, 500);
    },

    username: function(args, input){
      var inputField = input || window.content.document.lastInputField;
      if (inputField){
        buffer.focusElement(inputField);
        window.content.document.lastInputField = inputField;
        var host = hostname(inputField.ownerDocument, args);
        execute(['username', host]);
      }else{
        liberator.echoerr('Unable to determine input element.');
      }
    },

    password: function(args, input){
      var inputField = input || window.content.document.lastInputField;
      if (!inputField || inputField.nodeName != 'INPUT' || inputField.type != 'password'){
        var passInput = findPasswordInput(window.content.document);
        if (passInput){
          inputField = passInput;
        }
      }
      if (inputField){
        if (inputField.nodeName != 'INPUT' || inputField.type != 'password'){
          liberator.echoerr('Not a password input field.');
        }else{
          buffer.focusElement(inputField);
          window.content.document.lastInputField = inputField;
          var username = window.content.document.username || '';
          var key = hostname(inputField.ownerDocument, args);
          if (key.indexOf('@') == -1){
            if (!username) {
              execute(['username', key]);
              setTimeout(function(){
                if (window.content.document.username){
                  keyring['password'](args);
                }
              }, 500);
              return;
            }
            key = username + '@' + key;
          }
          execute(['password', key]);
        }
      }else{
        liberator.echoerr('Unable to determine input field.');
      }
    },

    _execute: function(args){
      var name = args.length ? args.shift() : '';
      var cmd = keyring[name];
      if (!cmd){
        liberator.echoerr('Unsupported keyring command: ' + name);
        return false;
      }
      return cmd(args);
    },

    _completer: function(context){
      var commands = [];
      for (var name in keyring){
        if (name.indexOf('_') !== 0 && keyring.hasOwnProperty(name)){
          commands.push(name.replace('_', '-'));
        }
      }
      context.completions = [[c, ''] for each (c in commands)];
    }
  }
}

var keyring = Keyring();

commands.add(["keyring"],
  "Insert username or password into a login field.",
  function(args) { keyring._execute(args); },
  { count: false, argCount: '*', completer: keyring._completer }
);