'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useMousePosition } from '@/hooks/useMousePosition';
import { seededRandom } from '@/utils/seededRandom';

interface ParticleField3DProps {
  count?: number;
}

export function ParticleField3D({ count = 100 }: ParticleField3DProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const mousePosition = useMousePosition();

  // Generate random particle positions
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const rand = seededRandom(count);

    for (let i = 0; i < count; i++) {
      // Position
      positions[i * 3] = (rand() - 0.5) * 10;
      positions[i * 3 + 1] = (rand() - 0.5) * 10;
      positions[i * 3 + 2] = (rand() - 0.5) * 3;

      // Velocity
      velocities[i * 3] = (rand() - 0.5) * 0.02;
      velocities[i * 3 + 1] = (rand() - 0.5) * 0.02;
      velocities[i * 3 + 2] = (rand() - 0.5) * 0.02;
    }

    return { positions, velocities };
  }, [count]);

  useFrame((state) => {
    if (!pointsRef.current) return;

    const positions = pointsRef.current.geometry.attributes.position
      .array as Float32Array;

    // Animate particles
    for (let i = 0; i < count; i++) {
      // Apply velocity
      positions[i * 3] += particles.velocities[i * 3];
      positions[i * 3 + 1] += particles.velocities[i * 3 + 1];
      positions[i * 3 + 2] += particles.velocities[i * 3 + 2];

      // Boundary check - wrap around
      if (Math.abs(positions[i * 3]) > 5) {
        positions[i * 3] *= -0.9;
      }
      if (Math.abs(positions[i * 3 + 1]) > 5) {
        positions[i * 3 + 1] *= -0.9;
      }
      if (Math.abs(positions[i * 3 + 2]) > 2) {
        positions[i * 3 + 2] *= -0.9;
      }

      // Mouse repulsion effect
      const mouseX = (mousePosition.x / window.innerWidth - 0.5) * 10;
      const mouseY = -(mousePosition.y / window.innerHeight - 0.5) * 10;

      const dx = positions[i * 3] - mouseX;
      const dy = positions[i * 3 + 1] - mouseY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 2) {
        const force = (2 - distance) * 0.01;
        positions[i * 3] += (dx / distance) * force;
        positions[i * 3 + 1] += (dy / distance) * force;
      }
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // Rotate entire field slowly
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.05;
  });

  return (
    <Points
      ref={pointsRef}
      positions={particles.positions}
      stride={3}
      frustumCulled={false}
    >
      <PointMaterial
        transparent
        color="#ffffff"
        size={0.05}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0.6}
      />
    </Points>
  );
}
