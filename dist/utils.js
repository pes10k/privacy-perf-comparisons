import { EOL } from "node:os";
export const indent = (text, prefix = "  ") => {
    return text
        .split(EOL)
        .map((x) => prefix + x)
        .join(EOL);
};
//# sourceMappingURL=utils.js.map