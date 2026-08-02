<script>
  /** docs/legacy/02-aesthetics.md §0.3. Separators are literal `&emsp;|&emsp;`. */
  let { onTerms, onPrivacy } = $props();

  const year = new Date().getFullYear();
</script>

<footer class="footer">
  <div class="content has-text-centered">
    <p>
      <strong class="has-text-primary">Yasss!</strong> Made with love, from your
      friends at <a href="https://crowdease.com" class="has-text-primary">CrowdEase</a>.
    </p>
    <p class="is-size-7 mt-5">
      Copyright &copy; {year} CrowdEase, LLC. All rights reserved.
    </p>
    <p class="is-size-7 mt-2">
      <a href="#terms" class="has-text-primary" onclick={onTerms}>Terms of Service</a>
      &emsp;|&emsp;
      <a href="#privacy" class="has-text-primary" onclick={onPrivacy}>Privacy Policy</a>
      &emsp;|&emsp;
      <a href="https://bitbucket.org/axonibyte/yasss" class="has-text-primary">Host it Yourself</a>
    </p>
  </div>
</footer>
