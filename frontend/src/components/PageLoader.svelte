<script>
  /**
   * docs/legacy/02-aesthetics.md §0.2. The legacy dismissed this on a hard-coded
   * 1 s timer rather than on data readiness; that minimum splash is preserved.
   */
  let { active = true } = $props();
</script>

<div class="pageloader is-bottom-to-top" class:is-active={active}>
  <span class="title">Hang on tight!</span>
</div>
