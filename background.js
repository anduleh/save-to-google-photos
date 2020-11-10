const saveToGooglePhotos = (info) => {
  // if the id is not correct, just exit
  if (info.menuItemId !== "save-to-google-photos") {
    return;
  }

  // ask for an auth token first
  chrome.identity.getAuthToken({ interactive: true }, async (token) => {
    // if runtime error, just exit
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }

    // if no auth token, just exit
    if (!token) {
      console.error("Could not retrieve auth token.");
      return;
    }

    // try saving the google photos
    try {
      // set photo url
      let photoUrl = info.srcUrl;

      // get photo from photo url
      let photo = await getPhoto(photoUrl);

      // upload photo with auth token and retry
      let uploadedPhoto = await uploadPhoto(photo, token, true);

      console.log("Uploaded Photo: ", uploadedPhoto);

      // if getting or uploading photo errors out, just log it
    } catch (err) {
      console.log("There was an error saving to Google Photos.");
      console.error(err);
    }
  });
};

// get photo needs to be XHR because fetch does not support local schema "file:////"
getPhoto = (url) => {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url);

    // ensure we are grabbing media blobs
    xhr.responseType = "blob";

    // We are looking for 2xx or 0 because local file:/// schema returns status as 0
    xhr.onload = function () {
      if ((this.status >= 200 && this.status < 300) || this.status == 0) {
        // if success, resolve entire response
        resolve(xhr.response);
      } else {
        // if error, reject entire response
        reject(xhr.response);
      }
    };

    // if xhr itself errors, just reject
    xhr.onerror = function () {
      reject(xhr.response);
    };

    // send xhr out the airlock
    xhr.send();
  });
};

// upload photo requires the photo blob and potential auth token with possible retry
uploadPhoto = async (photo, authToken, retry) => {
  // upload url
  const uploadUrl = "https://photoslibrary.googleapis.com/v1/uploads";

  // upload options
  const uploadOptions = {
    method: "POST",
    body: photo,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": photo.type,
      "X-Goog-Upload-Protocol": "raw",
    },
  };

  // upload bytes
  const uploadResponse = await fetch(uploadUrl, uploadOptions);

  // catch upload errors
  if (!uploadResponse.ok) {
    // if the error is 401 (Unauthorized) and first retry
    if (uploadResponse.status == 401 && retry) {
      // remove bad auth token
      chrome.identity.removeCachedAuthToken(
        { token: authToken },

        // get a new auth token
        chrome.identity.getAuthToken({ interactive: true }, (newAuthToken) => {
          // run uploadPhoto again with new auth token without retry
          return uploadPhoto(photo, newAuthToken, false);
        })
      );
      // else if the error is not 401, throw error
    } else {
      const errorResponse = await uploadResponse.json();
      const message = `An upload error has occured: ${errorResponse}`;
      throw new Error(message);
    }
  }

  // get the upload token from upload text
  const uploadToken = await uploadResponse.text();

  // media item payload
  const mediaItemPayload = {
    newMediaItems: [
      {
        simpleMediaItem: {
          uploadToken,
        },
      },
    ],
  };

  // media item url
  const mediaItemUrl =
    "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate";

  // media item options
  const mediaItemOptions = {
    method: "POST",
    body: JSON.stringify(mediaItemPayload),
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-type": "application/json",
    },
  };

  // create media item
  const mediaItemResponse = await fetch(mediaItemUrl, mediaItemOptions);

  // catch create media item errors
  if (!mediaItemResponse.ok) {
    // if the error is 401 (Unauthorized) and first retry
    if (mediaItemResponse.status == 401 && retry) {
      // remove bad auth token
      chrome.identity.removeCachedAuthToken(
        { token: authToken },

        // get a new auth token
        chrome.identity.getAuthToken({ interactive: true }, (newAuthToken) => {
          // run uploadPhoto again with new auth token without retry
          return uploadPhoto(photo, newAuthToken, false);
        })
      );
      // else if the error is not 401, throw error
    } else {
      const errorResponse = await mediaItemResponse.json();
      const message = `A media item error has occured: ${errorResponse}`;
      throw new Error(message);
    }
  }

  // parse media item as json
  const mediaItem = await mediaItemResponse.json();

  // return media item
  return mediaItem;
};

// create the context menu with 'save-to-google-photos' id
chrome.contextMenus.create({
  id: "save-to-google-photos",
  title: "Save to Google Photos",
  contexts: ["image", "video"],
});

// add a listener to the 'save-to-google-photos' context menu
chrome.contextMenus.onClicked.addListener(saveToGooglePhotos);
