import React, { Suspense } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Stage } from '@react-three/drei';

interface MeshViewerProps {
  modelUrl: string;
}

function Model({ url }: { url: string }) {
  // useGLTF automatically loads and caches the GLTF model
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

export function MeshViewer({ modelUrl }: MeshViewerProps) {
  return (
    <View style={styles.container}>
      <Canvas shadows camera={{ position: [0, 0, 5], fov: 50 }}>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6}>
            <Model url={modelUrl} />
          </Stage>
        </Suspense>
        <OrbitControls autoRotate autoRotateSpeed={2} />
      </Canvas>
      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.instruction}>Drag to rotate • Pinch to zoom</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instruction: {
    color: '#00FFD2',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  }
});
