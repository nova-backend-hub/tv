export function itemPortraits() {
  return Object.fromEntries(["mushroom", "green", "red", "banana", "blue", "star"].map((type) => [type, `<img src="./item-art/${type}.png" alt="${type}"/>`]));
}
