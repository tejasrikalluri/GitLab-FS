
var client = {};
var verfiedlevel, installed, configs, saveClicked, validation = 1;
$(document).ready(function () {
    verfiedlevel = 0;
    saveClicked = 0;
    app.initialized().then(function (_client) {
        client = _client;
        $("#loading").removeClass("hide");
        $("#closeError").click(function () {
            $(".errmsg").animate({
                "right": "-100%"
            });
        });
        getProjects();
    });
});

function getProjects() {
    var headers = { Authorization: "bearer <%= access_token %>" },
        reqData = { headers: headers, isOAuth: true },
        url = "https://<%= oauth_iparams.domain %>/api/v4/projects?owned=true";
    client.request.get(url, reqData).then(
        function (data) {
            var projects = JSON.parse(data.response);
            projects.forEach(function (project) {
                var opt = `<option value=${project.id}>${project.name}</option>`;
                $("#projects").append(opt);
            });
            if (installed) {
                $("#projects").val(configs.projects).trigger("change");
                $("#save").show();
                $("#save").attr("disabled", true);
                $("#projects").change(function (event) {
                    var oldProjectStored = configs.projects;
                    var newProjectChanged = $("#projects").val();
                    if (!(_.isEqual(oldProjectStored.sort(), newProjectChanged.sort()))) {
                        $("#save").attr("disabled", false);
                    }
                    else {
                        $("#save").attr("disabled", true)
                    }
                })
                $("#save").click(updateWebhook);
            }
            $("#projects").select2();
            initGitValidation();
            initfinalValidation();
            showLevel("1");
        },
        function (error) {
            errorHandler(error);
        }
    );
}

function updateWebhook() {
    let promises = [];
    if ($("#projects").val().length > 0) {
        $("#projects").attr("disabled", true);
        $("#commentsync").attr("disabled", true);
        $("#statussync").attr("disabled", true);
        $("#save").attr("disabled", true);
        saveClicked = 1;
        var newProjects = $("#projects").val();
        var oldProjects = configs.projects;
        let promises = [];
        handleNewProjectAddition(oldProjects, newProjects);
        handleProjectRemoval(oldProjects, newProjects, promises);
    }
    else {
        showNotification("e", "Please choose gitlab projects");
    }
}

var handleNewProjectAddition = function (oldproject, newproject) {
    var addedProject = [];
    for (var project in newproject) {
        if (!oldproject.includes(newproject[project])) {
            addedProject.push(newproject[project]);
        }
    }
    if (addedProject.length > 0) {
        for (var addedProjIndex = 0; addedProjIndex < addedProject.length; addedProjIndex++) {
            var projToAdd = addedProject[addedProjIndex];
            client.db.get("hookURL")
                .then(function (data) {
                    createWebHook(data.hookURL, projToAdd);
                },
                    function (error) {
                        $("#projects").attr("disabled", true);
                        $("#commentsync").attr("disabled", true);
                        $("#statussync").attr("disabled", true);
                        $("#save").attr("disabled", true);
                        showNotification("e", "Failed to get the hooks URL from DB");
                        console.error(error);
                    })
        }
    }
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
    client.request.post(`https://<%= oauth_iparams.domain %>/api/v4/projects/${project}/hooks`, payload).then(
        function (result) {
            var data = JSON.parse(result.response);
            dbSetWebhook(url, project, data);
        },
        function (error) {
            validation = 0;
            $("#projects").attr("disabled", true);
            $("#commentsync").attr("disabled", true);
            $("#statussync").attr("disabled", true);
            $("#save").attr("disabled", true);
            showNotification("e", "Error while creating a hook for each project");
            console.error(error);
        }
    );
};

var dbSetWebhook = function (url, project, data) {
    client.db
        .set(project, {
            hookid: data.id,
            fwurl: url
        })
        .then(
            function () {
                console.log("Webhook created! Project:", project);
            },
            function (error) {
                showNotification("e", "Error while storing the hooks ID for each project in Db");
                console.error(error);
            }
        );
}

var handleProjectRemoval = function (oldproject, newproject, promises) {
    var deletedProject = [];
    for (var projectIndex in oldproject) {
        if (!newproject.includes(oldproject[projectIndex])) {
            deletedProject.push(oldproject[projectIndex]);
        }
    }
    if (promises.length > 0 || deletedProject.length > 0) {
        removalPromise(promises, deletedProject);
    }
}

var removalPromise = function (promises, deletedProject) {
    function handleRemovalPromise(callback) {
        for (var deletedProjectIndex = 0; deletedProjectIndex < deletedProject.length; deletedProjectIndex++) {
            var projToDelete = deletedProject[deletedProjectIndex];
            promises.push(client.db.get(projToDelete)
                .then(function (data) {
                    return deleteWebHook(projToDelete, data.hookid).then(function () {
                        return client.db.delete(projToDelete);
                    });
                },
                    function (error) {
                        $("#projects").attr("disabled", true);
                        $("#commentsync").attr("disabled", true);
                        $("#statussync").attr("disabled", true);
                        $("#save").attr("disabled", true);
                        showNotification("e", "Error while getting the Hook id from the project Db");
                        console.error(error);
                    })
            )
        }
        Promise.all(promises)
            .then(function () { callback(null, null) })
            .catch(function (error) {
                console.error("error ", error.response);
                callback(error.status === 404 ? null : error.response, null);
            });
    }
    handleRemovalPromise(function (err, data) {
        console.log("Log: err, data", err, data);
        if (err) {
            console.log("1");
            $("#projects").attr("disabled", true);
            $("#commentsync").attr("disabled", true);
            $("#statussync").attr("disabled", true);
            $("#save").attr("disabled", true);
            showNotification("e", "Error while deleting the webhook for the project")

        }
        else {
            console.log("2", err);
        }
    });
}

var deleteWebHook = function (projects, hookids) {
    var project = projects;
    var hookid = hookids;
    var payload = {
        headers: { Authorization: "Bearer <%= access_token %>" },
        isOAuth: true
    };
    return client.request.delete(`https://<%= oauth_iparams.domain %>/api/v4/projects/${project}/hooks/${hookid}`, payload);
};


function initfinalValidation() {
    $("#finalproceed").click(function () {
        $("#loading").removeClass("hide");
        $("#finalproceed").attr("disabled", true)
        var splitDomain = $("#domain").val().split("/");
        if (splitDomain[splitDomain.length - 1] === "") {
            splitDomain.pop();
            $("#domain").val(splitDomain.join("/"));
        }

        var verifyURL = "https://" + $("#domain").val().replace("http://", "").replace("https://", "") + "/api/v2/ticket_fields"
        var headers = {
            Authorization: "Basic " + btoa($("#apikey").val()),
            "Content-Type": "application/json"
        };
        var options = {
            headers: headers
        };
        client.request
            .get(verifyURL, options)
            .then(function (data) {
                if (JSON.parse(data.response)) {
                    $("#loading").addClass("hide");
                    $("#domain").attr("disabled", "disabled");
                    $("#apikey").attr("disabled", "disabled");
                    $("#finalproceed").text("Verified")
                    verfiedlevel = 2;
                }
                else {
                    errorHandler({ "response": "Please enter valid domain name" });
                }

            })
            .catch(function (e) {
                $("#projects").attr("disabled", true);
                $("#commentsync").attr("disabled", true);
                $("#statussync").attr("disabled", true);
                $("#save").attr("disabled", true);

                $("#loading").addClass("hide");
                $("#finalproceed").attr("disabled", false)
                errorHandler(e);
            });
    });
}

function initGitValidation() {
    $("#gitlabproceed").click(function () {
        verfiedlevel = 1;

        if (installed) {
            if (saveClicked === 1 && $("#projects").val().length > 0) {
                showLevel("2");
            }
            else {
                showNotification("e", "Please click Register-Deregister webhook/select the Gitlab project(s) to link")
            }
        }
        else {
            if ($("#projects").val().length > 0) {
                showLevel("2");
            }
            else {
                showNotification("e", "Please select the Gitlab project(s) to link")
            }
        }
    });
}

function showLevel(level) {
    $(".container-fluid")
        .removeClass("hide")
        .addClass("hide");
    $("#iparams-lvl" + level).removeClass("hide");
    $("#loading").addClass("hide");
}



function errorHandler(err) {
    showNotification("e", err);
}

function showNotification(type, message) {
    message = message.response !== undefined ? message.response.replace(/{|}/g, "") : message;
    $(".errmsg").animate({
        "right": "25px"
    })
    $(".errmsg #errorMessage").html(message);
    if (type !== "e") {
        $(".errmsg").addClass("success");
        $(".errmsg i.icircle").addClass("hide");
        $(".errmsg i.success").removeClass("hide");
    } else {
        $(".errmsg i.icircle").removeClass("hide");
        $(".errmsg i.success").addClass("hide");
        $(".errmsg").removeClass("success");
    }
    setTimeout(function () {
        $(".errmsg").animate({
            "right": "-100%"
        })
    }, 6000);

}