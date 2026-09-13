// ============================================================
// HamedShop - GitHub Storage Layer
// ============================================================

const { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, JSON_DEFAULTS } = require("./config");

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is missing");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "HamedShop",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(
      `GitHub API Error ${response.status}: ${JSON.stringify(data)}`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

function githubContentPath(path) {
  return `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
}

async function readJsonFile(path, defaultValue = []) {
  try {
    const result = await githubRequest(
      `${githubContentPath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
    );

    if (!result.content) {
      return { data: defaultValue, sha: result.sha };
    }

    const decoded = Buffer.from(
      result.content.replace(/\n/g, ""),
      "base64"
    ).toString("utf8");

    if (!decoded.trim()) {
      return { data: defaultValue, sha: result.sha };
    }

    return {
      data: JSON.parse(decoded),
      sha: result.sha
    };
  } catch (error) {
    if (error.status === 404) {
      return { data: defaultValue, sha: null };
    }
    throw error;
  }
}

async function writeJsonFile(path, data, message, sha = null) {
  const content = JSON.stringify(data, null, 2);
  const encoded = Buffer.from(content, "utf8").toString("base64");

  const body = {
    message,
    content: encoded,
    branch: GITHUB_BRANCH
  };

  if (sha) body.sha = sha;

  try {
    return await githubRequest(githubContentPath(path), {
      method: "PUT",
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error.status !== 409) throw error;

    const latest = await readJsonFile(path, JSON_DEFAULTS[path] ?? []);

    if (latest.sha) {
      body.sha = latest.sha;
    } else {
      delete body.sha;
    }

    return githubRequest(githubContentPath(path), {
      method: "PUT",
      body: JSON.stringify(body)
    });
  }
}

async function writeBinaryFile(path, buffer, message, sha = null) {
  const encoded = Buffer.from(buffer).toString("base64");

  const body = {
    message,
    content: encoded,
    branch: GITHUB_BRANCH
  };

  if (sha) body.sha = sha;

  try {
    return await githubRequest(githubContentPath(path), {
      method: "PUT",
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error.status !== 409) throw error;

    try {
      const existing = await githubRequest(
        `${githubContentPath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
      );
      body.sha = existing.sha;
    } catch {
      delete body.sha;
    }

    return githubRequest(githubContentPath(path), {
      method: "PUT",
      body: JSON.stringify(body)
    });
  }
}

/** Delete a file from the repository (e.g. product image). */
async function deleteRepoFile(path, message) {
  const clean = String(path || "").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!clean) return false;

  try {
    const existing = await githubRequest(
      `${githubContentPath(clean)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
    );
    if (!existing || !existing.sha) return false;

    await githubRequest(githubContentPath(clean), {
      method: "DELETE",
      body: JSON.stringify({
        message: message || `Delete ${clean}`,
        sha: existing.sha,
        branch: GITHUB_BRANCH
      })
    });
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    console.warn("deleteRepoFile:", clean, error.message);
    return false;
  }
}

module.exports = {
  githubRequest,
  githubContentPath,
  readJsonFile,
  writeJsonFile,
  writeBinaryFile,
  deleteRepoFile
};
