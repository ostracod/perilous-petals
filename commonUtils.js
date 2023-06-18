
export const isValidInt = (value, allowNull = false) => {
    if (value === null && allowNull) {
        return true;
    }
    return (typeof value === "number" && !Number.isNaN(value)
        && value !== Infinity && value !== -Infinity
        && Math.floor(value) === value);
};


