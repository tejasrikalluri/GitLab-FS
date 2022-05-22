var base = require("base-64");
var request = require("request");

exports = {
  events: [
    { event: "onTicketUpdate", callback: "onTicketUpdateHandler" },
    { event: "onExternalEvent", callback: "onExternalEventHandler" },
    { event: "onConversationCreate", callback: "onConversationCreateCallback" },
    { event: "onAppInstall", callback: "onAppInstallCallback" },
    { event: "onAppUninstall", callback: "onAppUninstallCallback" }
  ],

  onExternalEventHandler: function (payload) {
    console.log("External event triggered!");
    if (payload.iparams.commentsync && (payload.data.event_type === "note") && !(payload.data.object_attributes.description.match("Note added from Freshservice:"))) {
      let projectID = payload.data.project.id;
      let issueID = payload.data.issue.iid;
      getAssociatedFDTickets(payload, projectID, issueID, payload.data.event_type);
    }

    if (payload.iparams.statussync && (payload.data.event_type === "issue") && (payload.data.object_attributes.state_id)) {
      let projectID = payload.data.project.id;
      let issueID = payload.data.object_attributes.iid;
      getAssociatedFDTickets(payload, projectID, issueID, payload.data.event_type);
    }

  }
  ,

  onTicketUpdateHandler: function (payload) {
    if (payload.iparams.statussync && payload.data.ticket.changes["status"]) {
      ticketStatusMap(payload);
    }

  },

  onConversationCreateCallback: function (payload) {
    if (payload.iparams.commentsync) {
      getDataStoreInfo(payload);
    }
  },

  onAppInstallCallback: function (payload) {
    generateTargetUrl()
      .then(function (url) {
        storeWebhookURL(url, payload);
      })
      .fail(function (err) {
        console.error("Log: err", err);
        renderData("Error in webhook registration");
      });
    renderData();
  },

  onAppUninstallCallback: function (payload) {
    function handleUninstall(callback) {
      let promises = [];
      payload.iparams.projects.forEach(function (project) {
        promises.push(
          $db.get(project).then(function (data) {
            return deleteWebHook(project, data.hookid).then(function () {
              return $db.delete(project);
            });
          },
            function (error) {
              console.log("Error while getting the project Db :");
              console.error(error);
            })
        );
      });
      Promise.all(promises)
        .then(function () { callback(null, null) })
        .catch(function (error) {
          console.error("error ", error.response);
          callback(error.status === 404 ? null : error.response, null);
        });
    }

    handleUninstall(function (err, data) {
      console.log("Log: err, data", err, data);
      if (err) {
        console.log("1");
        renderData(JSON.parse(err));
      }
      else {
        console.log("2", err);
        renderData();
      }
    });
  }

};

var deleteWebHook = function (projects, hookids) {
  var project = projects;
  var hookid = hookids;
  var payload = {
    headers: { Authorization: "Bearer <%= access_token %>" },
    isOAuth: true
  };
  return $request.delete(`https://<%= oauth_iparams.domain %>/api/v4/projects/${project}/hooks/${hookid}`, payload);
};

var storeWebhookURL = function (hookURL, payload) {
  $db
    .set("hookURL", {
      hookURL: hookURL
    })
    .then(
      function () {
        payload.iparams.projects.forEach(function (project) {
          createWebHook(hookURL, project);
        });
      },
      function (error) {
        console.log("Error while storing the hooks url in Db :");
        console.error(error);
      }
    );
}
var createWebHook = function (url, project) {
  var obj = {
    issues_events: "true",
    note_events: "true",
    url: url.replace(":10001", ".com")
  };
  var payload = {
    headers: { Authorization: "Bearer <%= access_token %>", "Content-Type": "application/json" },
    isOAuth: true,
    body: JSON.stringify(obj)
  };
  $request.post(`https://<%= oauth_iparams.domain %>/api/v4/projects/${project}/hooks`, payload).then(
    function (result) {
      var data = JSON.parse(result.response);
      dbSetWebhook(url, project, data);
    },
    function (error) {
      console.log("Error while creating a hook for each project:");
      renderData("Error while creating a hook for each project:");
      console.error(error);
    }
  );
};

var dbSetWebhook = function (url, project, data) {
  $db
    .set(project, {
      hookid: data.id,
      fwurl: url
    })
    .then(
      function (data) {
        console.log("Webhook created! Log: data", data);
      },
      function (error) {
        console.log("Error while storing the hooks ID in Db :");
        console.error(error);
      }
    );
}

var ticketStatusMap = function (args) {
  var fdTicketFieldsURL = "https://" + args.iparams.fddomain.replace("http://", "").replace("https://", "") + "/api/v2/ticket_fields",
    apiKey = args.iparams.fdapikey,
    headers = {
      "Authorization": `Basic ${base.encode(apiKey)}`
    },
    options = {
      url: fdTicketFieldsURL,
      method: "GET",
      headers: headers,
      json: true
    };
  fetchFreshdeskTicketFields(args, options);

}

var fetchFreshdeskTicketFields = function (args, options) {
  var fdTicketID = args.data.ticket.id,
    fromStatus = args["data"]["ticket"]["changes"]["status"][0],
    toStatus = args["data"]["ticket"]["changes"]["status"][1]
  request(options, function (error, response, Body) {
    if (error) {
      console.error(error);
    }
    else {
      var choices = [];
      for (var i = 0; i < Body.ticket_fields.length; i++) {
        if (Body.ticket_fields[i].name === "status") {
          choices = Body.ticket_fields[i]["choices"];
        }
      }
      var noteData = "Note added from Freshservice: " + "<p>Ticket status changed from <b>" + choices[fromStatus][0] + "</b> to <b>" + choices[toStatus][0] + "<p>" + "https://" + args.iparams.fddomain.replace("http://", "").replace("https://", "") + "/helpdesk/tickets/" + args.data.ticket.id + "</p>";
      retrieveFdDb(noteData, fdTicketID);
    }
  })
}

function retrieveFdDb(noteData, fdTicketID) {
  $db.get("fd-" + fdTicketID).then(
    function (issueObj) {
      var issueId = issueObj.issueId;
      var projectId = issueObj.projectId
      createGitLabNote(noteData.replace("#", ""), issueId, projectId);
    },
    function (error) {
      console.log("Error while fetching the Freshservice Ticket Db :");
      console.error(error);
    }
  )
}

var getDataStoreInfo = function (payload) {
  var fdTicketID = payload.data.conversation.ticket_id;



  console.log("Domain : " + payload.domain);
  console.log("Ticket ID of conversation:", fdTicketID);
  if (!((payload.data.conversation.body).match("Note added from Gitlab:"))) {
    $db.get("fd-" + fdTicketID).then(
      function (issueObj) {
        console.log("issueObj is : ", JSON.stringify(issueObj));
        var conversationText = "Note added from Freshservice: <p>" + payload.data.conversation.body_text + "</p><p>" + "https://" + payload.iparams.fddomain.replace("http://", "").replace("https://", "") + "/helpdesk/tickets/" + payload.data.conversation.ticket_id + "</p>";
        var issueId = issueObj.issueId;
        var projectId = issueObj.projectId
        console.log("calling create git lab note issueId:", issueId + "projectId :", projectId);
        createGitLabNote(conversationText.replace("#", ""), issueId, projectId);
      },
      function (error) {
        console.log("Error while getting the Freshservice Ticket Db :");
        console.error(error);
      })
  }
}

var createGitLabNote = function (conversationText, issueId, projectID) {
  var payload = {
    headers: { Authorization: "Bearer <%= access_token %>", "Content-Type": "application/json" },
    isOAuth: true
  };
  console.log("conversationText : ", conversationText);
  $request.post(`https://<%= oauth_iparams.domain %>/api/v4/projects/${projectID}/issues/${issueId}/notes?body=${conversationText}`, payload).then(
    function () {
      console.log("Note added in Gitlab!");
    },
    function (error) {
      console.error("Error while adding a note in Gitlab!");
      console.error(JSON.stringify(error));
    }
  );

}

var getAssociatedFDTickets = function (payload, projectID, issueID, eventType) {
  $db.get(`${projectID}-${issueID}`).then(function (associatedFdTickets) {
    let listOfFdNotesAPI = [];
    associatedFdTickets["fdTicketIDs"].forEach(function (value) {
      listOfFdNotesAPI.push(postFdNote("https://" + payload.iparams.fddomain.replace("http://", "").replace("https://", "") + "/api/v2/tickets/" + value + "/notes", payload, eventType));
    })
    Promise.all(listOfFdNotesAPI).then(function () {
      console.log("Success : Note added !!!");
    })
      .catch(function (error) {
        console.log("Error while adding a note in Freshservice");
        console.error(error);
      })
  },
    function (error) {
      console.log("Error while getting the issue Db :");
      console.error(error);
    })
}

function postFdNote(url, payload, eventType) {
  var headers = {
    Authorization: "Basic " + base.encode(payload.iparams.fdapikey),
    "Content-Type": "application/json"
  };
  var content;
  if (eventType === "note") {
    content = "Note added from Gitlab: <p>" + payload.data.object_attributes.description + "</p><p>" + payload.data.object_attributes.url + "</p>";
  }
  else {
    content = "Note added from Gitlab: <p>" + "Status changed to <b>" + payload.data.object_attributes.state + "</b></p><p>" + payload.data.object_attributes.url + "</p>";
  }
  var body = {
    body: content
  };
  var options = {
    headers: headers,
    body: JSON.stringify(body)
  }
  return $request.post(url, options)

}






