export function seedFirstTransactionValue(confirmedValue, updateAttempt) {
  let firstUpdate = true;
  return (currentValue) => {
    const value = currentValue ?? (firstUpdate ? confirmedValue : null);
    firstUpdate = false;
    return updateAttempt(value);
  };
}
