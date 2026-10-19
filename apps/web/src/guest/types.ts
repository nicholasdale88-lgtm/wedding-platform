/** Props for the generated design views (guest/generated/*). */

/** Values the design's markup reads: strings, numbers, handlers and lists, exactly as the design names them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ViewValues = Record<string, any>;

export interface ViewProps {
  v: ViewValues;
  /** Text catalogue lookup: the wedding's wording for a key (Admin → Guest pages → Every word). */
  t: (key: string) => string;
}
