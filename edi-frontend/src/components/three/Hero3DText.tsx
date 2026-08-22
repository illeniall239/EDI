'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text3D, Center } from '@react-three/drei';
import { Mesh } from 'three';
import { useMousePosition } from '@/hooks/useMousePosition';

interface Hero3DTextProps {
  text: string;
}

export function Hero3DText({ text }: Hero3DTextProps) {
  const meshRef = useRef<Mesh>(null);
  const mousePosition = useMousePosition();
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (!meshRef.current) return;

    // Gentle rotation based on mouse position
    const targetRotationY = (mousePosition.x / window.innerWidth - 0.5) * 0.3;
    const targetRotationX = -(mousePosition.y / window.innerHeight - 0.5) * 0.3;

    // Smooth lerp to target rotation
    meshRef.current.rotation.y += (targetRotationY - meshRef.current.rotation.y) * 0.05;
    meshRef.current.rotation.x += (targetRotationX - meshRef.current.rotation.x) * 0.05;

    // Subtle floating animation
    meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;

    // Monochrome shimmer: no hue, just a slow lightness pulse
    if (meshRef.current.material) {
      const material = meshRef.current.material as any;
      if (material.color) {
        const lightness = 0.6 + Math.sin(state.clock.elapsedTime * 0.6) * 0.2;
        material.color.setHSL(0, 0, lightness);
      }
    }
  });

  return (
    <Center>
      <Text3D
        ref={meshRef}
        font="/fonts/Space_Grotesk_Bold.json"
        size={1}
        height={0.2}
        curveSegments={12}
        bevelEnabled
        bevelThickness={0.02}
        bevelSize={0.02}
        bevelOffset={0}
        bevelSegments={5}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        {text}
        <meshStandardMaterial
          metalness={0.9}
          roughness={0.1}
          color={hovered ? '#ffffff' : '#8a8a8a'}
          emissive={hovered ? '#4d4d4d' : '#000000'}
          emissiveIntensity={hovered ? 0.5 : 0.2}
        />
      </Text3D>
    </Center>
  );
}
