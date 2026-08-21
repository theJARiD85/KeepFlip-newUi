# Expo discovers this generated provider by its fully qualified name at runtime.
# R8 otherwise removes or obfuscates it because the reference is reflective.
-keep class expo.modules.ExpoModulesPackageList { *; }
