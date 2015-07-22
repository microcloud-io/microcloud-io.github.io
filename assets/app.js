'use strict';
var mc;

mc = angular.module('microcloudApp', ['ngRoute', 'ngCookies', 'ngResource', 'ngAnimate', 'angular-growl', 'route-segment', 'view-segment', 'angular-loading-bar', 'templates']);

mc.constant('ACCESS_LEVEL', {
  admin: 2,
  user: 1,
  open: 0
});

mc.constant('ENDPOINTS', (function() {
  return {
    api: window.location.protocol + "//api." + window.location.host,
    docker: window.location.protocol + "//docker." + window.location.host
  };
})());

mc.run(function($rootScope, $http, $location, Session, ENDPOINTS, ACCESS_LEVEL) {
  Session.fromCookie();
  $rootScope.Session = Session;
  $rootScope.location = $location;
  return $rootScope.$on('routeSegmentChange', function(event, next, current) {
    if (next.segment) {
      if (!Session.checkAccess(next.segment.params.accessLevel)) {
        return $location.path('/login');
      }
    }
  });
});

mc.config(function($httpProvider, $routeSegmentProvider, $locationProvider, ACCESS_LEVEL) {
  $locationProvider.html5Mode(true);
  $httpProvider.interceptors.push(function($q, $window, $location) {
    return function(promise) {
      return promise.then(function(res) {
        return res;
      }, function(res) {
        if (res.status === 401 || res.status === 419) {
          $location.url('/login');
        }
        return $q.reject(response);
      });
    };
  });
  return $routeSegmentProvider.when('/', 'home').when('/signup', 'signup').when('/login', 'login').when('/logout', 'logout').when('/docker', 'docker').when('/docker/images/', 'docker.images').when('/admin', 'admin').segment('home', {
    accessLevel: ACCESS_LEVEL.open,
    controller: 'homeController',
    templateUrl: 'home.html'
  }).segment('signup', {
    accessLevel: ACCESS_LEVEL.open,
    controller: 'User.signup',
    templateUrl: 'user/signup.html'
  }).segment('login', {
    accessLevel: ACCESS_LEVEL.open,
    controller: 'User.login',
    templateUrl: 'user/login.html'
  }).segment('logout', {
    accessLevel: ACCESS_LEVEL.open,
    controller: 'User.logout'
  }).segment('docker', {
    accessLevel: ACCESS_LEVEL.user,
    controller: 'Docker',
    templateUrl: 'docker.html'
  }).within().segment('system', {
    "default": true,
    controller: 'Docker.system',
    accessLevel: ACCESS_LEVEL.user,
    templateUrl: 'docker/system.html'
  }).segment('images', {
    controller: 'Docker.images',
    accessLevel: ACCESS_LEVEL.user,
    templateUrl: 'docker/images.html'
  }).up().segment('admin', {
    templateUrl: 'users.html',
    accessLevel: ACCESS_LEVEL.admin
  });
});

mc.controller('homeController', function($scope, $rootScope, Session) {});

mc.controller('Docker', function($http, $scope, $location, Session, $routeSegment, ENDPOINTS, ACCESS_LEVEL, growl, DockerSystem) {
  return true;
});

mc.service('Session', function($http, $cookieStore, ENDPOINTS) {
  this.accessLevel = 0;
  this.fromCookie = function() {
    var cookie;
    if ((cookie = $cookieStore.get('Session'))) {
      return this.create(cookie.token, cookie.accessLevel, cookie.username, cookie.name);
    }
  };
  this.create = function(token, accessLevel1, username, name) {
    this.token = token;
    this.accessLevel = accessLevel1;
    this.username = username;
    this.name = name;
    this.docker = ENDPOINTS.docker + "/" + this.username;
    $http.defaults.headers.common.Session = this.token;
    return $cookieStore.put('Session', this);
  };
  this.destroy = function() {
    this.token = this.username = this.name = null;
    $cookieStore.remove('Session');
    return this.accessLevel = 0;
  };
  this.checkAccess = function(accessLevel) {
    return !accessLevel || accessLevel <= this.accessLevel;
  };
  return this;
});

mc.controller('User.login', function($http, $scope, $location, Session, ENDPOINTS, ACCESS_LEVEL, growl) {
  if (Session.accessLevel) {
    growl.addWarnMessage("Already logged in.");
    $location.path('/docker');
  }
  return $scope.login = function(credentials) {
    return $http.post(ENDPOINTS.api + '/user/login', credentials, {
      headers: {
        'Session': ''
      }
    }).then(function(res) {
      var user;
      if (res.data.login === 'success') {
        user = res.data.user;
        Session.create(res.headers('Session'), ACCESS_LEVEL[user.accessLevel], user.username, user.name);
        return $location.path('/docker');
      } else {
        return $scope.alerts = res.data.alerts;
      }
    }, function(res) {
      return $scope.alerts = res.data.alerts;
    });
  };
});

mc.controller('User.logout', function($http, $scope, $location, Session, ENDPOINTS, ACCESS_LEVEL) {
  if (!Session.accessLevel) {
    $location.path('/');
  }
  Session.destroy();
  return $location.path('/');
});

mc.controller('User.signup', function($scope, $rootScope, $http, ENDPOINTS, Session, $location, ACCESS_LEVEL, $routeSegment, growl) {
  $scope.form = {
    showForm: true,
    showResponse: false,
    showLetsGetStarted: false
  };
  if (Session.accessLevel) {
    $http.get(ENDPOINTS.api + '/docker/create');
    growl.addInfoMessage("Already logged in.", {
      ttl: 3500
    });
    $location.path('/docker');
  }
  $scope.credentials = {};
  return $scope.signup = function(credentials) {
    return $http.post(ENDPOINTS.api + '/user/signup', credentials).then(function(res) {
      var user;
      if (res.data.status === 'OK') {
        user = res.data.user;
        Session.create(res.headers('Session'), ACCESS_LEVEL[user.accessLevel], user.username, user.name);
        $scope.form = {
          showForm: false,
          showResponse: true
        };
        $scope.alerts = res.data.alerts || [];
        $scope.alerts.push({
          "classification": "info",
          "message": "Creating your docker."
        });
        $scope.alerts.push({
          "classification": "info",
          "message": "Please wait..."
        });
        return $http.get(ENDPOINTS.api + '/docker/create');
      } else {
        return $scope.alerts = res.data.alerts;
      }
    }).then(function(res) {
      if (res.data.status === 'OK') {
        $scope.alerts = res.data.alerts;
        return $http.get(ENDPOINTS.api + '/docker/start');
      } else {
        return Array.push.apply($scope.alerts, res.data.alerts);
      }
    }).then(function(res) {
      if (res.data.status === 'OK') {
        Array.push.apply($scope.alerts, res.data.alerts);
        return $scope.form.showLetsGetStarted = true;
      } else {
        return $scope.alerts = res.data.alerts;
      }
    })["catch"](function() {
      return false;
    }, function() {
      return $scope.alerts = [
        {
          "classification": "danger",
          "message": "Something went wrong. Please try again."
        }
      ];
    });
  };
});

mc.service('DockerContainer', function($resource, ENDPOINTS, Session) {
  return $resource(ENDPOINS.docker + Session.username + "/containers/:id/:action", {}, {
    query: {
      method: "GET",
      params: {
        all: 0,
        action: "json"
      },
      isArray: true
    },
    get: {
      method: "GET",
      params: {
        action: "json"
      }
    },
    start: {
      method: "POST",
      params: {
        id: "@id",
        action: "start"
      }
    },
    stop: {
      method: "POST",
      params: {
        id: "@id",
        t: 5,
        action: "stop"
      }
    },
    restart: {
      method: "POST",
      params: {
        id: "@id",
        t: 5,
        action: "restart"
      }
    },
    kill: {
      method: "POST",
      params: {
        id: "@id",
        action: "kill"
      }
    },
    changes: {
      method: "GET",
      params: {
        action: "changes"
      },
      isArray: true
    },
    create: {
      method: "POST",
      params: {
        action: "create"
      }
    },
    remove: {
      method: "DELETE",
      params: {
        id: "@id",
        v: 0
      }
    }
  });
});


/*
).factory("Image", ($resource, Settings) ->
  $resource Settings.url + "/images/:id/:action", {},
    query:
      method: "GET"
      params:
        all: 0
        action: "json"

      isArray: true

    get:
      method: "GET"
      params:
        action: "json"

    search:
      method: "GET"
      params:
        action: "search"

    history:
      method: "GET"
      params:
        action: "history"

      isArray: true

    create:
      method: "POST"
      params:
        action: "create"

    insert:
      method: "POST"
      params:
        id: "@id"
        action: "insert"

    push:
      method: "POST"
      params:
        id: "@id"
        action: "push"

    tag:
      method: "POST"
      params:
        id: "@id"
        action: "tag"
        force: 0
        repo: "@repo"

    remove:
      method: "DELETE"
      params:
        id: "@id"

      isArray: true

).factory("Docker", ($resource, Settings) ->
  $resource Settings.url + "/version", {},
    get:
      method: "GET"

).factory("Auth", ($resource, Settings) ->
  $resource Settings.url + "/auth", {},
    get:
      method: "GET"

    update:
      method: "POST"

).factory("System", ($resource, Settings) ->
  $resource Settings.url + "/info", {},
    get:
      method: "GET"

).factory("Settings", (DOCKER_ENDPOINT, DOCKER_PORT, DOCKER_API_VERSION, UI_VERSION) ->
  url = DOCKER_ENDPOINT
  url = url + DOCKER_PORT + "\\" + DOCKER_PORT  if DOCKER_PORT
  displayAll: false
  endpoint: DOCKER_ENDPOINT
  version: DOCKER_API_VERSION
  rawUrl: DOCKER_ENDPOINT + DOCKER_PORT + "/" + DOCKER_API_VERSION
  uiVersion: UI_VERSION
  url: url
  firstLoad: true
).factory("ViewSpinner", ->
  spinner = new Spinner()
  target = document.getElementById("view")
  spin: ->
    spinner.spin target
    return

  stop: ->
    spinner.stop()
    return
).factory("Messages", ($rootScope) ->
  send: (title, text) ->
    $.gritter.add
      title: title
      text: text
      time: 2000
      before_open: ->
        false  if $(".gritter-item-wrapper").length is 3

    return

  error: (title, text) ->
    $.gritter.add
      title: title
      text: text
      time: 6000
      before_open: ->
        false  if $(".gritter-item-wrapper").length is 4

    return
).factory "Dockerfile", (Settings) ->
  url = Settings.rawUrl + "/build"
  build: (file, callback) ->
    data = new FormData()
    dockerfile = new Blob([file],
      type: "text/text"
    )
    data.append "Dockerfile", dockerfile
    request = new XMLHttpRequest()
    request.onload = callback
    request.open "POST", url
    request.send data
 */

mc.service('DockerImages', function($resource, Session) {
  return $resource(Session.docker + "/info", {}, {
    query: {
      method: "GET",
      params: {
        all: 0,
        action: "json"
      },
      isArray: true
    },
    get: {
      method: "GET",
      params: {
        action: "json"
      }
    },
    search: {
      method: "GET",
      params: {
        action: "search"
      }
    },
    history: {
      method: "GET",
      params: {
        action: "history"
      },
      isArray: true
    },
    create: {
      method: "POST",
      params: {
        action: "create"
      }
    },
    insert: {
      method: "POST",
      params: {
        id: "@id",
        action: "insert"
      }
    },
    push: {
      method: "POST",
      params: {
        id: "@id",
        action: "push"
      }
    },
    tag: {
      method: "POST",
      params: {
        id: "@id",
        action: "tag",
        force: 0,
        repo: "@repo"
      }
    },
    remove: {
      method: "DELETE",
      params: {
        id: "@id"
      },
      isArray: true
    }
  });
});

mc.service('DockerSystem', function($resource, Session) {
  return $resource(Session.docker + "/info", {}, {
    get: {
      method: 'GET'
    },
    update: {
      method: 'POST'
    }
  });
});

mc.controller('Docker.images', function($http, $scope, $location, Session, ENDPOINTS, ACCESS_LEVEL, growl, DockerImages) {
  return console.log(DockerImages.get({}, function(data) {
    return console.log(data);
  }));
});

mc.controller('Docker.system', function($http, $scope, $location, Session, ENDPOINTS, ACCESS_LEVEL, growl, DockerSystem) {
  console.log(DockerSystem.get({}, function(data) {
    return console.log(data);
  }));
  return true;
});
