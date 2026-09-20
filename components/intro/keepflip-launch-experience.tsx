// Platform siblings provide the actual launch surface. This compatibility
// module keeps TypeScript and native imports resolvable while Metro selects
// .native.tsx or .web.tsx for the active platform.
export { default } from './keepflip-launch-experience.native';
