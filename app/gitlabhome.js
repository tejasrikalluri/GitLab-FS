/*global getLinkedIssues,logError */
var client = {};
$(document).ready(function () {
  app.initialized().then(function (_client) {
    client = _client;
    client.events.on(
      "app.activated",
      function () {
        loadGitlabIssues();
      },
      function (error) {
        logError("Error while activating Gitlab app", error);
      }
    );
  }).catch(function (error) {
    logError("Error while initialising Gitlab app", error);
  });
});

function showUnauthorizedError() {
  $(".unauthorized-error").show();
}

function loadGitlabIssues() {
  $(".loading").show();
  $(".issue-link-container").hide();
  $("#freshrelease-issue-container").hide();
  client.data.get("ticket").then(
    function (data) {
      ticketDetails(data);
    },
    function (error) {
      logError("Unable to get the ticket data", error);
    }
  );
}

function ticketDetails(data) {
  let ticket = data.ticket;
  getLinkedIssues(ticket.display_id).then(
    function (issues) {
      showFreshreleaseContent(issues, ticket.display_id);
      $(".loading").hide();
    },
    function (error) {
      if (error.status === 401) {
        $(".loading").hide();
        showUnauthorizedError();
      }
      else if (error.status === 404) {
        $(".loading").hide();
        showLinkButton();
      }
      else {
        logError("Unable to get the freshrelease issues", error);
      }
    }
  );
}

function showFreshreleaseContent(issues, fdTicketID) {
  if (issues) {
    renderIssue(issues, fdTicketID);
    $("#freshrelease-issue-container").show();
  }
  else {
    showLinkButton();
  }
}

function showLinkButton() {
  $(".issue-link-container").show();
  $(".issue-link-container").off("click");
  $(".issue-link-container").on("click", function () {
    openLinkIssueModal();
  });
}

function renderIssue(issue, fdTicketID) {
  let issueKey = "<a href=" + issue.web_url + " target='_blank'>" + issue.title + "</a>";
  let issueAuthor = `<a href="${issue.author.web_url || "--"}" target='_blank'>${issue.author.name || "--"}</a>`;
  var obj = {};
  $(".issue-key").html(issueKey);
  $(".issue-title").html(issue.description);
  $(".issue-status .issue-property-value").html(issue.state);
  $(".issue-assignee .issue-property-value .assignee-name").html(issueAuthor);
  obj.issue = issue;
  obj.fdTicketID = fdTicketID;
  $(".unlink-issue").data("issueDetails", obj);
  $(".unlink-issue").on("click", checkConfirmation)
  readMore();
}

function checkConfirmation() {
  client.interface.trigger("showConfirm", {
    title: "Confirm Unlink",
    message: "Are you sure you want to unlink this ticket?",
    saveLabel: "Yes",
    cancelLabel: "No"
  }).then(function (result) {
    if (result.message === "Yes") {
      unLinkClicked();
    }
  }).catch(function (error) {
    logError("Error in showing confirmation dialog", error)
  });
}
function unLinkClicked() {
  var fdTicketDbToDelete = $(".unlink-issue").data().issueDetails.fdTicketID;
  var projectID = $(".unlink-issue").data().issueDetails.issue.project_id;
  var issueId = $(".unlink-issue").data().issueDetails.issue.iid;
  if (fdTicketDbToDelete) {
    client.db.delete("fd-" + fdTicketDbToDelete)
  }
  client.db.get(projectID + "-" + issueId).then(
    function (issueData) {
      refreshProjectIssueDB(issueData, fdTicketDbToDelete, projectID, issueId);
    },
    function (error) {
      logError("Error in retrieving the issue Datastore", error)
    });

}

function refreshProjectIssueDB(issueData, fdTicketDbToDelete, projectID, issueId) {
  var newFdTicketAssociation = issueData.fdTicketIDs.filter(function (value) {
    return value !== fdTicketDbToDelete
  });
  if (newFdTicketAssociation.length > 0) {
    setProjectIssueDb(projectID, issueId, newFdTicketAssociation);
  }
  else {
    deleteProjectIssueDb(projectID, issueId);
  }
}

function setProjectIssueDb(projectID, issueId, newFdTicketAssociation) {
  client.db.set(projectID + "-" + issueId, { fdTicketIDs: newFdTicketAssociation }).then(
    function () {
      $("#freshrelease-issue-container").hide();
      showLinkButton();
    },
    function (error) {
      logError("Error in updating the issue Datastore with the linked tickets", error)
    }
  );
}

function deleteProjectIssueDb(projectID, issueId) {
  client.db.delete(projectID + "-" + issueId).then(
    function () {
      $("#freshrelease-issue-container").hide();
      showLinkButton();
    },
    function (error) {
      logError("Error in deleting the issue Db :", error)
    }
  )
}

function readMore() {
  var targetContainer = $(".issue-title");
  var showMoreBtn = $(".read-more-btn");
  var defaultHeight = 36;

  targetContainer.css({
    "max-height": defaultHeight,
    overflow: "hidden"
  });

  setTimeout(function () {
    if (targetContainer[0].scrollHeight <= defaultHeight) {
      showMoreBtn.hide();
    }
    else {
      showMoreBtn.show();
    }
  }, 100);

  showMoreBtn.off("click");
  showMoreBtnClicked(showMoreBtn, targetContainer, defaultHeight);
}

function showMoreBtnClicked(showMoreBtn, targetContainer, defaultHeight) {
  showMoreBtn.on("click", function () {
    var newHeight = 0;
    var containerHeight = targetContainer[0].scrollHeight;
    if (targetContainer.hasClass("active")) {
      newHeight = defaultHeight;
      targetContainer.removeClass("active");
      showMoreBtn.text("Read more...");
    }
    else {
      newHeight = containerHeight;
      targetContainer.addClass("active");
      showMoreBtn.text("... Read less");
    }

    targetContainer.animate(
      {
        "max-height": newHeight
      },
      300
    );
  });
}
function openLinkIssueModal() {
  client.iparams.get("projects").then(
    function (data) {
      var selectedProjects = data.projects;
      client.data.get("ticket").then(
        function (data) {
          openModal(selectedProjects, data);
        },
        function (error) {
          logError("Unable to get ticket data", error);
        }
      );
    },
    function (error) {
      logError("Unable to get selected_projects", error);
    }
  );
}

function openModal(selectedProjects, data) {
  var ticketSubject = data.ticket.subject;
  var ticketId = data.ticket.display_id;
  client.interface.trigger(
    "showModal",
    {
      title: "GitLab - Link work item",
      template: "modal.html",
      data: {
        ticketSubject: ticketSubject,
        ticketId: ticketId,
        selectedProjects: selectedProjects
      }
    }
  ).then(function () {
    console.log("Modal triggered!");
  }, function (error) {
    if (error) {
      callingRenderingIssue();
      logError("Error while receiving the message after closing the modal :", error);
    }
  });
}

function callingRenderingIssue() {
  client.instance.receive(
    function (event) {
      var data = event.helper.getData();
      if (data.message.messageType === "reload") {
        event.preventDefault();
        loadGitlabIssues();
      }
    }
  )
}