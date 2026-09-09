/** Secret values are intentionally kept behind this interface and never enter workflow state. */
export interface SecretBroker {
  put(reference: string, value: string): Promise<void>;
  get(reference: string): Promise<string>;
}
