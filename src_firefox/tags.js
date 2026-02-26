import { defaultConfig, getKeywords } from "./config.js";

// ── State ──
const state = {
  and: [],
  or: [],
  minus: [],
};

// ── DOM refs ──
const containers = {
  and: document.getElementById("andTagsContainer"),
  or: document.getElementById("orTagsContainer"),
  minus: document.getElementById("minusTagsContainer"),
};
const inputs = {
  and: document.getElementById("andInput"),
  or: document.getElementById("orInput"),
  minus: document.getElementById("minusInput"),
};
const counts = {
  and: document.getElementById("andCount"),
  or: document.getElementById("orCount"),
  minus: document.getElementById("minusCount"),
};

const toast = document.getElementById("toast");
const importModal = document.getElementById("importModal");
const importTextarea = document.getElementById("importTextarea");
const importCategory = document.getElementById("importCategory");

// ── Tag CRUD ──

function addTag(category, value) {
  const tag = value.trim();
  if (!tag) return false;
  if (state[category].includes(tag)) return false;
  state[category].push(tag);
  renderTags(category);
  return true;
}

function removeTag(category, value) {
  const idx = state[category].indexOf(value);
  if (idx === -1) return;
  state[category].splice(idx, 1);
  renderTags(category);
}

function renderTags(category) {
  const container = containers[category];
  const chipClass = `tag-${category === "minus" ? "minus" : category}`;
  container.innerHTML = "";

  if (state[category].length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.setAttribute("data-i18n-empty", "true");
    empty.textContent = getEmptyText();
    container.appendChild(empty);
  } else {
    state[category].forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = `tag-chip ${chipClass}`;

      const text = document.createElement("span");
      text.textContent = tag;

      const btn = document.createElement("button");
      btn.className = "remove-btn";
      btn.textContent = "×";
      btn.title = "Remove";
      btn.addEventListener("click", () => removeTag(category, tag));

      chip.appendChild(text);
      chip.appendChild(btn);
      container.appendChild(chip);
    });
  }

  counts[category].textContent = state[category].length;
}

function getEmptyText() {
  return _translations["emptyTags"]
    ? _translations["emptyTags"].message
    : "No tags yet";
}

function renderAll() {
  renderTags("and");
  renderTags("or");
  renderTags("minus");
}

// ── Storage ──

function loadTags() {
  browser.storage.local.get(defaultConfig, (items) => {
    state.and = parseKeywords(items.andKeywords || "");
    state.or = parseKeywords(items.orKeywords || "");
    state.minus = parseKeywords(items.minusKeywords || "");
    renderAll();
  });
}

function saveTags() {
  const newValues = {
    andKeywords: state.and.join(" "),
    orKeywords: state.or.join(" "),
    minusKeywords: state.minus.join(" "),
  };

  browser.storage.local.set(newValues, () => {
    showToast(
      _translations["tagsSaved"]
        ? _translations["tagsSaved"].message
        : "Tags saved!",
      "success"
    );
  });

  browser.runtime.sendMessage({ action: "updateConfig" }, (response) => {
    if (browser.runtime.lastError) {
      console.log(browser.runtime.lastError.message);
    }
  });
}

function parseKeywords(str) {
  return str
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// ── Import / Export ──

function importFromText(text, category) {
  const tags = text
    .split(/[\s,，、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let added = 0;
  tags.forEach((tag) => {
    if (addTag(category, tag)) added++;
  });
  return added;
}

function importFromJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        let added = 0;

        if (data.andKeywords) {
          const tags = Array.isArray(data.andKeywords)
            ? data.andKeywords
            : parseKeywords(data.andKeywords);
          tags.forEach((t) => {
            if (addTag("and", t)) added++;
          });
        }
        if (data.orKeywords) {
          const tags = Array.isArray(data.orKeywords)
            ? data.orKeywords
            : parseKeywords(data.orKeywords);
          tags.forEach((t) => {
            if (addTag("or", t)) added++;
          });
        }
        if (data.minusKeywords) {
          const tags = Array.isArray(data.minusKeywords)
            ? data.minusKeywords
            : parseKeywords(data.minusKeywords);
          tags.forEach((t) => {
            if (addTag("minus", t)) added++;
          });
        }

        resolve(added);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function exportToJsonFile() {
  const data = {
    andKeywords: state.and,
    orKeywords: state.or,
    minusKeywords: state.minus,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pixiv-tags.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(
    _translations["exportSuccess"]
      ? _translations["exportSuccess"].message
      : "Exported successfully!",
    "success"
  );
}

// ── Toast ──

let toastTimer = null;
function showToast(message, type = "success") {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

// ── Modal ──

function openImportModal() {
  importTextarea.value = "";
  importModal.classList.add("active");
  importTextarea.focus();
}

function closeImportModal() {
  importModal.classList.remove("active");
}

function confirmImport() {
  const text = importTextarea.value;
  const category = importCategory.value;
  if (!text.trim()) {
    closeImportModal();
    return;
  }
  const added = importFromText(text, category);
  closeImportModal();
  showToast(
    (_translations["importedCount"]
      ? _translations["importedCount"].message
      : "Imported {count} tags"
    ).replace("{count}", added),
    "success"
  );
}

// ── i18n ──

let _translations = {};

function loadTranslations(lang) {
  fetch(`_locales/${lang}/messages.json`)
    .then((r) => r.json())
    .then((data) => {
      _translations = data;
      // apply translations by id
      document.querySelectorAll("[id]").forEach((el) => {
        if (data[el.id]) {
          // skip containers and inputs
          if (
            el.tagName === "DIV" &&
            (el.id.endsWith("Container") || el.id === "importModal")
          )
            return;
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
          if (el.tagName === "SELECT" && el.id !== "importCategory") return;
          el.textContent = data[el.id].message;
        }
      });
      // placeholders
      document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (data[key]) {
          el.placeholder = data[key].message;
        }
      });
      // re-render empty states
      renderAll();
    })
    .catch((err) => console.error("Error loading translations:", err));
}

// ── Event Listeners ──

// Add tag on button click
["and", "or", "minus"].forEach((cat) => {
  document
    .getElementById(`${cat}AddBtn`)
    .addEventListener("click", () => {
      const input = inputs[cat];
      const val = input.value.trim();
      if (val) {
        // support space-separated input
        const parts = val.split(/\s+/).filter(Boolean);
        parts.forEach((p) => addTag(cat, p));
        input.value = "";
        input.focus();
      }
    });
});

// Add tag on Enter key
["and", "or", "minus"].forEach((cat) => {
  inputs[cat].addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = inputs[cat].value.trim();
      if (val) {
        const parts = val.split(/\s+/).filter(Boolean);
        parts.forEach((p) => addTag(cat, p));
        inputs[cat].value = "";
      }
    }
  });
});

// Save
document.getElementById("saveBtn").addEventListener("click", saveTags);

// Import text
document.getElementById("importTextBtn").addEventListener("click", openImportModal);
document.getElementById("modalCancelBtn").addEventListener("click", closeImportModal);
document.getElementById("modalConfirmBtn").addEventListener("click", confirmImport);

// Close modal on overlay click
importModal.addEventListener("click", (e) => {
  if (e.target === importModal) closeImportModal();
});

// Import file
document.getElementById("importFileBtn").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});

document.getElementById("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const added = await importFromJsonFile(file);
    showToast(
      (_translations["importedCount"]
        ? _translations["importedCount"].message
        : "Imported {count} tags"
      ).replace("{count}", added),
      "success"
    );
  } catch (err) {
    showToast(
      _translations["importError"]
        ? _translations["importError"].message
        : "Invalid JSON file",
      "error"
    );
    console.error(err);
  }
  e.target.value = "";
});

// Export
document.getElementById("exportBtn").addEventListener("click", exportToJsonFile);

// Language
const langSelect = document.getElementById("languageSelect");
const defaultLang = localStorage.getItem("language") || "en";
langSelect.value = defaultLang;
loadTranslations(defaultLang);

langSelect.addEventListener("change", (e) => {
  const lang = e.target.value;
  localStorage.setItem("language", lang);
  loadTranslations(lang);
});

// Init
loadTags();
