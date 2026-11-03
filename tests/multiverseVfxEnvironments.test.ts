import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  buildMultiverseThemePrefab,
  MULTIVERSE_SCENE_IDS,
  MULTIVERSE_THEME_CONFIGS,
  PERFORMANCE_BUDGET_LIMITS,
  type QuestPropType,
} from '../src/components/modes/three/MultiversePortal/multiverseEnvironments';
import {
  computeLumiBobCurve,
  createLumiPetCompanionFX,
  createPhoneticStoneBurstFX,
  createPortalEnergyVortexFX,
} from '../src/components/modes/three/MultiversePortal/multiverseVfx';
import { buildMultiversePortalEnvironment } from '../src/components/modes/three/MultiversePortal/MultiversePortalScene';

describe('GDS-TC-2026-EXP v2.6 — 1. Multiverse 3D Room & Environment Prefabs (mv-01 to mv-05)', () => {
  it('assembles all 5 Multiverse themes with DirectionalLight, HemisphereLight, ambient anchors, FogExp2, skybox, and quest prop visual anchors', () => {
    const requiredProps: QuestPropType[] = [
      'chest',
      'altar',
      'stone_pedestal',
      'portal_archway',
    ];

    for (const sceneId of MULTIVERSE_SCENE_IDS) {
      const prefab = buildMultiverseThemePrefab({
        sceneId,
        tier: 'high',
        loadGlb: false,
      });

      assert.equal(prefab.sceneId, sceneId);
      assert.equal(prefab.meta.id, sceneId);
      assert.ok(prefab.skybox instanceof THREE.Mesh, `${sceneId}: skybox mesh`);
      assert.ok(
        prefab.lighting.directionalLight instanceof THREE.DirectionalLight,
        `${sceneId}: DirectionalLight`,
      );
      assert.ok(
        prefab.lighting.hemisphereLight instanceof THREE.HemisphereLight,
        `${sceneId}: HemisphereLight`,
      );
      assert.ok(
        prefab.lighting.ambientAnchorGroup.children.length >= 2,
        `${sceneId}: ambient light anchors`,
      );
      assert.ok(prefab.lighting.fog instanceof THREE.FogExp2, `${sceneId}: FogExp2`);

      // Verify clean visual anchors for interactive quest props without hardcoded logic
      for (const propType of requiredProps) {
        const anchor = prefab.questAnchors[propType];
        assert.ok(anchor instanceof THREE.Group, `${sceneId}: anchor ${propType}`);
        assert.equal(anchor.userData.kind, 'quest_prop_anchor');
        assert.equal(anchor.userData.propType, propType);
        assert.equal(anchor.userData.sceneId, sceneId);
        assert.ok(anchor.children.length >= 1, `${sceneId}: visual geometry on ${propType}`);
      }

      // Tick environment shader/animation + LOD update with a test camera
      const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
      cam.position.set(0, 3.6, 7.6);
      cam.updateMatrixWorld(true);
      prefab.update(0.016, 1.25, cam);

      prefab.dispose();
    }
  });
});

describe('GDS-TC-2026-EXP v2.6 — 2. GPU Particle Systems & Visual FX (VFX)', () => {
  it('2a) PortalEnergyVortexFX uses THREE.Points + ShaderMaterial and transitions IDLE -> PORTAL_CHARGING -> PORTAL_STABILIZED', () => {
    const vortex = createPortalEnergyVortexFX({ particleCount: 120 });
    assert.ok(vortex.points instanceof THREE.Points);
    assert.ok(vortex.material instanceof THREE.ShaderMaterial);
    assert.equal(vortex.getState(), 'IDLE');

    const idleSpin = vortex.material.uniforms.uSpinMultiplier.value as number;
    vortex.setState('PORTAL_CHARGING');
    assert.equal(vortex.getState(), 'PORTAL_CHARGING');
    vortex.update(0.25, 1.0);
    const chargingSpin = vortex.material.uniforms.uSpinMultiplier.value as number;
    assert.ok(chargingSpin > idleSpin, 'spin speed increases during PORTAL_CHARGING');

    vortex.setState('PORTAL_STABILIZED');
    assert.equal(vortex.getState(), 'PORTAL_STABILIZED');
    vortex.update(0.5, 2.0);
    const stabilizedFactor = vortex.material.uniforms.uStateFactor.value as number;
    assert.ok(stabilizedFactor > 0.7, 'uStateFactor ramps toward 1.0 in PORTAL_STABILIZED');

    vortex.dispose();
  });

  it('2b) PhoneticStoneBurstFX expands radiant energy rings and drives GPU THREE.Points burst upon calibration', () => {
    const burst = createPhoneticStoneBurstFX({ particleCount: 64 });
    assert.ok(burst.points instanceof THREE.Points);
    assert.equal(burst.isActive(), false);
    assert.equal(burst.group.visible, false);

    burst.triggerBurst([0, 1.62, 2.2], 3);
    assert.equal(burst.isActive(), true);
    assert.equal(burst.group.visible, true);
    const initialScale = burst.ringMesh.scale.x;

    burst.update(0.35, 0.35);
    assert.ok(
      burst.ringMesh.scale.x > initialScale,
      'radiant energy ring expands outward after calibration trigger',
    );
    assert.ok(
      (burst.pointsMaterial.uniforms.uProgress.value as number) > 0,
      'GPU burst shader progress advances',
    );

    // Finish burst lifetime
    burst.update(1.2, 1.55);
    assert.equal(burst.isActive(), false);
    assert.equal(burst.group.visible, false);

    burst.dispose();
  });

  it('2c) LumiPetCompanionFX animates floating bob curve, soft ambient glow aura, and movement particle trail', () => {
    const lumi = createLumiPetCompanionFX({ position: [1.35, 0.55, 2.1], trailCount: 24 });
    assert.ok(lumi.trailPoints instanceof THREE.Points);
    assert.ok(lumi.auraShellMesh instanceof THREE.Mesh);

    const s0 = computeLumiBobCurve(0.2, 'idle');
    const s1 = computeLumiBobCurve(0.9, 'celebrate');
    assert.notEqual(s0.offsetY, s1.offsetY);

    lumi.setPetState('listening');
    assert.equal(lumi.getPetState(), 'listening');
    lumi.update(0.08, 0.5);

    lumi.setPetState('celebrate');
    lumi.update(0.08, 1.0);
    assert.ok(lumi.petMeshGroup.position.y > 0.55);

    lumi.dispose();
  });
});

describe('GDS-TC-2026-EXP v2.6 — 3. Draw Call & LOD Optimization and Performance Budgets', () => {
  it('uses THREE.InstancedMesh for repeated props (ruins, pipes, vines, crystals) and THREE.LOD across high/low tiers within strict VRAM & draw-call budgets', () => {
    const expectedInstancedKeyByScene: Record<string, string> = {
      'mv-01': 'ruins',
      'mv-02': 'pipes',
      'mv-03': 'vines',
      'mv-04': 'crystals',
      'mv-05': 'pipes',
    };

    for (const sceneId of MULTIVERSE_SCENE_IDS) {
      for (const tier of ['high', 'low'] as const) {
        const handle = buildMultiversePortalEnvironment(() => true, {
          sceneId,
          tier,
          loadGlb: false,
        });

        const prefab = handle.getThemePrefab();
        const key = expectedInstancedKeyByScene[sceneId];
        assert.ok(
          prefab.instancedMeshes[key] instanceof THREE.InstancedMesh,
          `${sceneId} (${tier}): expected InstancedMesh '${key}'`,
        );
        assert.ok(
          prefab.instancedMeshes[key].count >= 6,
          `${sceneId} (${tier}): InstancedMesh '${key}' batches multiple instances`,
        );
        assert.ok(
          prefab.lodGroups.length >= 2,
          `${sceneId} (${tier}): has THREE.LOD groups`,
        );

        const audit = handle.auditPerformance();
        assert.equal(audit.sceneId, sceneId);
        assert.equal(audit.tier, tier);

        if (tier === 'low') {
          assert.ok(
            audit.totalEstimatedVramMb <= PERFORMANCE_BUDGET_LIMITS.low.maxVramMb,
            `${sceneId} low-tier VRAM ${audit.totalEstimatedVramMb} MB <= 15 MB`,
          );
          assert.ok(
            audit.drawCalls <= PERFORMANCE_BUDGET_LIMITS.low.maxDrawCalls,
            `${sceneId} low-tier draw calls ${audit.drawCalls} <= 300`,
          );
        } else {
          assert.ok(
            audit.totalEstimatedVramMb <= PERFORMANCE_BUDGET_LIMITS.high.maxVramMb,
            `${sceneId} high-tier VRAM ${audit.totalEstimatedVramMb} MB <= 40 MB`,
          );
        }
        assert.equal(audit.passesAllBudgets, true);

        // Verify triggerPortalOpening activates both PortalEnergyVortexFX (PORTAL_STABILIZED) and PhoneticStoneBurstFX
        handle.setActiveStone('mv_portal_ central');
        assert.equal(handle.getVortexState(), 'PORTAL_CHARGING');
        handle.triggerPortalOpening(3);
        assert.equal(handle.getVortexState(), 'PORTAL_STABILIZED');
        assert.equal(handle.stoneBurstFX.isActive(), true);

        handle.dispose();
      }
    }

    // Verify theme switching on a live handle
    const live = buildMultiversePortalEnvironment(() => true, {
      sceneId: 'mv-01',
      tier: 'low',
      loadGlb: false,
    });
    assert.equal(live.getSceneId(), 'mv-01');
    live.setSceneTheme('mv-04', 'high');
    assert.equal(live.getSceneId(), 'mv-04');
    assert.equal(live.getTier(), 'high');
    assert.equal(
      live.getThemePrefab().meta.nameEn,
      MULTIVERSE_THEME_CONFIGS['mv-04'].nameEn,
    );
    live.dispose();
  });
});
