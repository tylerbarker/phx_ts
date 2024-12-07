// wraps value in closure or returns closure
export const closure = (value: unknown) => {
  if (typeof value === "function") {
    return value;
  }
  const closure = () => value;
  return closure;
};
