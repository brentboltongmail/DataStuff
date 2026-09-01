# Global Rules

## Git Version Control
- **Always Commit and Push**: At the end of every change or completed task in any repository, automatically stage the changes (`git add`), write a clear descriptive commit message (`git commit -m "..."`), and push the commits to the remote repository (`git push`).

## Three.js & 3D Coordinate Orientation Rules
- **Three.js Right-Handed System & Forward Vector (-Z)**: Always remember that Three.js uses a right-handed coordinate system where the standard forward/facing vector is **negative Z (`(0, 0, -1)`)**, NOT positive Z.
  - `Object3D.lookAt()` and cameras always point the local **`-Z` axis** toward the target.
  - Directional meshes (arrows, chevrons, cones, vehicle noses, pointers, projectiles) must always be modeled or pre-rotated so that their forward/pointed tip faces **`-Z`** in local space.
  - 2D shapes (`THREE.Shape`) drawn in the XY plane have their forward tip along `+Y`; rotating by `+Math.PI / 2` around the X-axis maps `+Y` to **`-Z` (forward)**.
  - Geographical navigation: $+X = \text{East}$, $-X = \text{West}$, $-Z = \text{North}$, $+Z = \text{South}$. True compass heading is $\text{atan2}(\Delta \text{East}, \Delta \text{North}) = \text{atan2}(\Delta X, -\Delta Z)$.
