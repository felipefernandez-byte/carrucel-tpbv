let tokenCache = {
  accessToken: "",
  expiresAt: 0
};

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

async function getAccessToken() {
  const now = Date.now();

  if (
    tokenCache.accessToken &&
    tokenCache.expiresAt > now + 60_000
  ) {
    return tokenCache.accessToken;
  }

  const clientId = required("GOOGLE_CLIENT_ID");
  const clientSecret = required("GOOGLE_CLIENT_SECRET");
  const refreshToken = required("GOOGLE_REFRESH_TOKEN");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
      data.error ||
      "Google OAuth no pudo renovar el token."
    );
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt:
      now +
      Math.max(60, Number(data.expires_in || 3600)) * 1000
  };

  return tokenCache.accessToken;
}

async function fetchDriveMetadata(fileId) {
  const token = await getAccessToken();

  const fields = encodeURIComponent(
    "id,name,mimeType,size,thumbnailLink,webContentLink,webViewLink"
  );

  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?supportsAllDrives=true&fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Google Drive respondió ${response.status}`
    );
  }

  return {
    ...data,
    _accessToken: token
  };
}

async function fetchDriveOriginal(fileId) {
  const token = await getAccessToken();

  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?alt=media&supportsAllDrives=true`;

  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

async function fetchCredentialedUrl(url, accessToken) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

module.exports = {
  getAccessToken,
  fetchDriveMetadata,
  fetchDriveOriginal,
  fetchCredentialedUrl
};
