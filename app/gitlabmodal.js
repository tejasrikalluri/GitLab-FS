/*global getAllProjects,logError,issueSearch,createIssue */
var client = {};
$(document).ready(function () {
  app.initialized().then(
    function (_client) {
      client = _client;
      client.instance.context().then(
        function (context) {
          initializeProjectsList(context.data);
          bindCloseModal();
        },
        function (error) {
          logError("Unable to get instance context", error);
        }
      );
    },
    function (error) {
      logError("Error while initialize modal app", error);
    }
  );
});

function bindCloseModal() {
  $("#close-modal").off("click");
  $("#close-modal").on("click", function () {
    client.instance.close();
  });
}

function initializeProjectsList(data) {
  getAllProjects().then(
    function (projects) {
      var allowedProjects = projects.filter(function (project) {
        return data.selectedProjects.includes(project.id.toString());
      });
      $("#project-list").select2({
        data: allowedProjects,
        placeholder: "Select from list or type to search a project"
      })
        .on("change", function () {
          initializeSearchBox();
          var project = $("#project-list").select2("data")[0] || {};
          if (project.id) {
            $(".issue-title-row").show();
          }
        })
        .val(null)
        .trigger("change");
    },
    function (error) {
      logError("Unable to get the projects list", error);
    }
  );
}

function initializeSearchBox() {
  var project = $("#project-list").select2("data")[0] || {};
  $("#issue-title")
    .select2({
      placeholder: "Search work item by Title or create new",
      minimumInputLength: 3,
      maximumInputLength: 255,
      ajax: {
        url: `https://<%= oauth_iparams.domain %>/api/v4/projects/${project.id}/search?scope=issues&search=`,
        transport: function (params, success, failure) {
          var $request = issueSearch(params);
          $request.then(success, failure);
          return $request;
        },
        processResults: function (data) {
          var searchString = data.searchString.replace(/\s+/g, " ").trim();
          if (searchString === "") {
            return data.issues;
          }
          var newIssueTitle = ['Create new work item "', searchString, '"'].join("");
          var issueId = ["new-issue-", Date.now()].join("");
          var issues = [{ id: issueId, title: searchString, text: newIssueTitle }];
          issues = issues.concat(data.issues);
          issues = issues.map(function (issue) {
            issue.id = issue.id || issue.iid;
            return issue;
          });
          return { results: issues };
        },
        delay: 250,
        data: function (params) {
          var query = {
            search: params.term.replace(/\s+/g, " ").trim()
          };
          return query;
        }
      },
      escapeMarkup: function (markup) {
        return markup;
      },
      templateResult: formatSearchResult,
      templateSelection: formatSelection
    })
    .on("change", function () {
      var issue = $("#issue-title").select2("data")[0];
      if (isNewIssue(issue.id)) {
        $(".issue-description-row").show();
        bindSubmitButton();
      }
      else {
        $(".issue-description-row").hide();
        bindSubmitButton();
      }
    });
}

function isNewIssue(issueId) {
  if (issueId) {
    var match = issueId.toString().match(/^(new-issue)+/g);
    return match && match.length !== 0;
  }
  else {
    return false;
  }
}

function formatSearchResult(issue) {
  if (issue.loading) {
    return issue.text;
  }
  var markup = "<div class='select2-result-issue-wrapper clearfix'>";
  if (isNewIssue(issue.id)) {
    markup += "<span class='select2-result-issue__title text-ellipsis new-issue'>" + issue.text + "</span>";
  }
  else {
    markup += "<span class='select2-result-issue__title text-ellipsis'>" + issue.title + "</span>";
  }
  if (issue.key) {
    markup += "<span class='issue-key'> #" + issue.key + "</span>";
  }
  markup += "</div>";
  return markup;
}

function formatSelection(issue) {
  return issue.title || issue.text;
}

function unbindSubmitButton() {
  $("#create-issue").addClass("disabled");
  $("#create-issue").off("click");
}

function bindSubmitButton() {
  unbindSubmitButton();
  $("#create-issue").removeClass("disabled");
  $("#create-issue").on("click", function () {
    $(".error").hide();
    $("#create-issue").prop("disabled", true);
    linkGitlabIssue();
  });
}

function linkGitlabIssue() {
  $(".loading").show();
  $(".content-wrapper").hide();
  client.data.get("ticket").then(
    function (data) {
      var params = issueParams(data.ticket);
      createIssue(params).then(
        function () {
          $(".issue-link-container").hide();
          client.instance.send({
            message: { messageType: "reload" }
          });
          sendSuccessNotification();
          client.instance.close();
        },
        function () {
          showLinkFailedMessage();
          $(".loading").hide();
        }
      );
    },
    function (error) {
      logError("Unable to get ticket data", error);
    }
  );
}

function sendSuccessNotification() {
  client.interface.trigger("showNotify", {
    type: "success",
    message: "Project and issue linked successfuly"
    /* The "message" should be plain text */
  }).then(function () {
    console.log("Successfuly added project...")
  }).catch(function () {
    console.log("Failed sending notificatin..")
  });
}


function issueParams(ticket) {
  var issue = $("#issue-title").select2("data")[0];
  var issueDescription = $("#issue-description").val();
  var issueId = isNewIssue(issue.id) ? null : issue.id;
  var project = $("#project-list").select2("data")[0].id;
  return {
    issue: {
      id: issueId,
      title: issue.title,
      description: issueDescription
    },
    projectId: project,
    remoteresourceId: ticket.display_id
  };
}

function showLinkFailedMessage() {
  showErrorMessage("Unable to link the work item with the ticket");
}

function showErrorMessage(errorMessage) {
  $(".error").html(errorMessage);
  $(".error").show();
}
