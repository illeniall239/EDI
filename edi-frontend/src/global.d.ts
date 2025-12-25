/// <reference types="react" />

declare global {
  namespace JSX {
    // Extend React's intrinsic elements to ensure compatibility
    // This is intentionally empty - we're just ensuring the types are merged
    type IntrinsicElements = React.JSX.IntrinsicElements
  }
}

export {};
