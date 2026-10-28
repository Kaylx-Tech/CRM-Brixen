/** True when an apiRequest result was refused because the workspace's plan does not include the feature. */
export function isPlanLocked(res) {
  return res?.data?.details?.code === "plan_feature"
}
