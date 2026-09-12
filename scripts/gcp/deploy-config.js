import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function deploymentConfig(env) {
  const formats = {
    GCP_PROJECT_ID: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
    GCP_REGION: /^[a-z]+-[a-z]+[0-9]+$/,
    GCP_ZONE: /^[a-z]+-[a-z]+[0-9]+-[a-z]$/,
    GCP_INSTANCE: /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/,
    GCP_REPOSITORY: /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/,
    GCP_WORKLOAD_IDENTITY_PROVIDER:
      /^projects\/[0-9]+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/,
    GCP_DEPLOY_SERVICE_ACCOUNT:
      /^[a-z][a-z0-9-]+@[a-z][a-z0-9-]+\.iam\.gserviceaccount\.com$/,
    GITHUB_SHA: /^[a-f0-9]{40}$/,
    GITHUB_RUN_NUMBER: /^[1-9][0-9]{0,11}$/,
  };
  const invalid = Object.keys(formats).filter(
    (key) => !formats[key].test(env[key] || ""),
  );
  if (!env.GCP_ZONE?.startsWith(`${env.GCP_REGION}-`)) invalid.push("GCP_ZONE");
  if (
    !env.GCP_DEPLOY_SERVICE_ACCOUNT?.endsWith(
      `@${env.GCP_PROJECT_ID}.iam.gserviceaccount.com`,
    )
  )
    invalid.push("GCP_DEPLOY_SERVICE_ACCOUNT");
  if (env.GITHUB_REF !== "refs/heads/main") invalid.push("GITHUB_REF");
  if (!["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME))
    invalid.push("GITHUB_EVENT_NAME");
  if (invalid.length)
    throw new Error(
      `Missing or invalid deployment settings: ${[...new Set(invalid)].join(", ")}`,
    );
  const registry = `${env.GCP_REGION}-docker.pkg.dev`;
  return {
    registry,
    imageRepository: `${registry}/${env.GCP_PROJECT_ID}/${env.GCP_REPOSITORY}/rolecast`,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const config = deploymentConfig(process.env);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `registry=${config.registry}\nimage_repository=${config.imageRepository}\n`,
      );
    console.log("Deployment configuration is valid.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
