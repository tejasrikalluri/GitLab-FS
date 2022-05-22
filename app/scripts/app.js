document.onreadystatechange = function () {
  if (document.readyState === 'interactive') renderApp();

  function renderApp() {
    var onInit = app.initialized();

    onInit
      .then(function getClient(_client) {
        window.client = _client;
        client.events.on('app.activated', renderContactName);
      })
      .catch(handleErr);
  }
};

function renderContactName() {

  let headers = { Authorization: "bearer <%= access_token %>" },
    reqData = { headers: headers, isOAuth: true },
    url = "https://gitlab.com/api/v4/projects/34640023/issues/2";
  client.request.get(url, reqData).then(function (data) {
    const response = JSON.parse(data.response);
    console.log(response);
  },
    function (error) {
      console.log(error)
      //handleError(error);
    }
  );
}

function handleErr(err = 'None') {
  console.error(`Error occured. Details:`, err);
}
