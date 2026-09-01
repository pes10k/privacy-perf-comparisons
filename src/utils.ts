import { EOL } from "node:os";

export const indent = (text: string, prefix = "  "): string => {
  return text
    .split(EOL)
    .map((x) => prefix + x)
    .join(EOL);
};
