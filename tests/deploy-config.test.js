import { expect, it } from "vitest";
import { deploymentConfig } from "../scripts/gcp/deploy-config.js";
const env = {
  GCP_PROJECT_ID: "rolecast-example",
  GCP_REGION: "asia-east1",
  GCP_ZONE: "asia-east1-b",
  GCP_INSTANCE: "rolecast",
  GCP_REPOSITORY: "rolecast",
  GCP_WORKLOAD_IDENTITY_PROVIDER:
    "projects/123456789/locations/global/workloadIdentityPools/rolecast-github/providers/github-main",
  GCP_DEPLOY_SERVICE_ACCOUNT:
    "rolecast-deploy@rolecast-example.iam.gserviceaccount.com",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_RUN_NUMBER: "42",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "push",
};
it("accepts only explicit main-branch deployment configuration", () => {
  expect(deploymentConfig(env).imageRepository).toBe(
    "asia-east1-docker.pkg.dev/rolecast-example/rolecast/rolecast",
  );
  expect(() =>
    deploymentConfig({ ...env, GITHUB_EVENT_NAME: "workflow_dispatch" }),
  ).not.toThrow();
  for (const patch of [
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GCP_INSTANCE: "rolecast'; rm -rf /" },
    { GCP_ZONE: "us-central1-a" },
    { GCP_PROJECT_ID: "" },
    {
      GCP_DEPLOY_SERVICE_ACCOUNT:
        "deploy@other-project.iam.gserviceaccount.com",
    },
    { GITHUB_RUN_NUMBER: "0" },
  ])
    expect(() => deploymentConfig({ ...env, ...patch })).toThrow(
      "deployment settings",
    );
});
