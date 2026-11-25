// Fisher-Yates shuffle returning a new array (unbiased, unlike sort(() => Math.random() - 0.5)).
export const shuffleItems = (items) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
