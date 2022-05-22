function getLinkedIssues(ticketId) {
  return new Promise(function (resolve, reject) {
    client.db.get(`fd-${ticketId}`).then(
      function (result) {
        var url = `https://<%= oauth_iparams.domain %>/api/v4/projects/${result.projectId}/issues/${result.issueId}`;
        var options = headerParams();
        client.request.get(url, options).then(
          function (data) {
            resolve(JSON.parse(data.response));
          },
          function (err) {
            reject(err);
          }
        );
      },
      function (error) {
        reject(error);
      }
    );
  });
}

function getAllProjects() {
  return new Promise(function (resolve, reject) {
    var options = headerParams();

    client.request.get("https://<%= oauth_iparams.domain %>/api/v4/projects?owned=true", options).then(
      function (data) {
        var frPorjects = JSON.parse(data.response);
        frPorjects = $.map(frPorjects, function (project) {
          var obj = {};
          obj.id = project.id;
          obj.text = project.name;
          return obj;
        });
        resolve(frPorjects);
      },
      function (error) {
        reject(error);
      }
    );
  });
}

function issueSearch(searchParams) {
  return new Promise(function (resolve, reject) {
    var searchString = searchParams.data.search;
    var searchUrl = searchParams.url + encodeURIComponent(searchString);
    var options = headerParams();
    client.request.get(searchUrl, options).then(
      function (data) {
        let issues = JSON.parse(data.response);
        issues = issues.map(function (issue) {
          issue.id = issue.key;
          return issue;
        });
        return resolve({ issues: issues, searchString: searchString });
      },
      function (error) {
        reject(error);
      }
    );
  });
}

function createIssue(issueParams) {
  return new Promise(function (resolve, reject) {
    var options = headerParams();
    options.body = JSON.stringify(issueParams);
    if (!issueParams.issue.id) {
      client.request.post(`https://<%= oauth_iparams.domain %>/api/v4/projects/${issueParams.projectId}/issues?title=${issueParams.issue.title}&description=${issueParams.issue.description}`, options).then(
        function (data) {
          var payload = JSON.parse(data.response);
          Promise.all(
            [
              linkinFdWithIssue(issueParams.remoteresourceId, payload.project_id, payload.iid),
              linkIssueWithFD(issueParams.remoteresourceId, payload.project_id, payload.iid)
            ]
          ).then(function (data) {
            resolve(data);
          }).catch(reject)
        },
        function (error) {
          reject(error);
        }
      );
    }
    else {
      Promise.all(
        [
          linkinFdWithIssue(issueParams.remoteresourceId, issueParams.projectId, issueParams.issue.id),
          linkIssueWithFD(issueParams.remoteresourceId, issueParams.projectId, issueParams.issue.id)
        ]
      ).then(function (data) {
        resolve(data);
      }).catch(reject)
    }
  });
}

function linkinFdWithIssue(fdTicket, projectId, gitlabId) {
  return client.db.set(`fd-${fdTicket}`, { issueId: gitlabId, projectId: projectId });
}

function linkIssueWithFD(fdTicketID, projectId, gitlabId) {
  return new Promise((resolve) => {
    var fdTicket = fdTicketID;
    client.db.get(`${projectId}-${gitlabId}`)
      .then(
        function (data) {
          data.fdTicketIDs.push(fdTicket)
          client.db.set(`${projectId}-${gitlabId}`, { fdTicketIDs: data.fdTicketIDs })
            .then(() => { resolve(); })
            .catch(logError("Error while getting the issue Db :"));
        },
        function () {
          var fdTicketID = [];
          fdTicketID.push(fdTicket);
          client.db.set(`${projectId}-${gitlabId}`, { fdTicketIDs: fdTicketID })
            .then(() => { resolve(); })
            .catch(function(e){
              console.error("Error Occured!");
              console.error(e);
              logError("Error while storing the linked ticket is issue DB")
            });
        }
      )
  })
}

function headerParams() {
  return {
    headers: {
      Authorization: "bearer <%= access_token %>",
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    isOAuth: true
  };
}

function logError(message) {
  client.interface.trigger("showNotify", {
    type: "error",
    title: "Something went wrong",
    message: message
  });
}
