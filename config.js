/**
 * @fileoverview Fichier de configuration central pour l'extension.
 * Contient toutes les URLs, sélecteurs CSS, et autres constantes
 * pour faciliter la maintenance. Ce fichier n'est pas encore connecté au reste de l'extension
 */

export const EXTENSION_CONFIG = {
  MP: {
    BASE_URL: "http://s-tom-1:90/MeilleurPilotage",
    FORM_URL: "http://s-tom-1:90/MeilleurPilotage/servlet/Gestion?CONVERSATION=RECR_GestionCandidat&ACTION=CREE&MAJ=N",
    UPLOAD_URL: "http://s-tom-1:90/MeilleurPilotage/servlet/UG",
    PATHS: {
      LOGIN: "/servlet/LoginMeilleurPilotage"
    },
    SELECTORS: {
      JOB_ID_DROPDOWN: 'select[name="MP:ID_RECH"] option',
      INTERNAL_ID_CONTAINER: '#FORM_PRIN',
      ERROR_MAIL: "mp\\:err_mail",
      ERROR_LASTNAME: "mp\\:err_nom",
      ERROR_FIRSTNAME: "mp\\:err_pren",
      PK_INPUT_REGEX: '<input[^>]+name="pk"[^>]+value="(\\d+)"',
    },
    FORM_INPUT_NAMES: {
      LASTNAME: "MP:NOM",
      FIRSTNAME: "MP:PREN",
      PHONE: "MP:TELE",
      EMAIL: "MP:MAIL",
      JOB_ID: "MP:ID_RECH",
      ORIGIN_CV: "MP:ID_ORIG_CV",
      STATUS: "MP:ID_STAT",
    },
    ORIGIN_MAPPING: {
      linkedin: { annonce: '4', chasse: '11' },
      hellowork: { annonce: '17', chasse: '14' }
    }
  },
  LINKEDIN: {
    BASE_URL_PREFIX: "https://www.linkedin.com/talent/hire/",
    CV_URL_PATTERN: "https://www.linkedin.com/dms/prv/document/media*",
    PATHS: {
      PROFILE_MANAGE: "/manage/all/profile/",
      PROFILE_APPLICANTS: "/discover/applicants/profile/",
      LIST_MANAGE: "/manage/all",
      LIST_APPLICANTS: "/discover/applicants?jobId",
    },
    SELECTORS: {
      PROFILE_INDEX_TAB: '[data-live-test-profile-index-tab]',
      ATTACHMENTS_TAB: '[data-live-test-profile-attachments-tab]',
      EMAIL: "span[data-test-contact-email-address]",
      PHONE: "span[data-test-contact-phone][data-live-test-contact-phone]",
      NOTE_BUTTON: "button[title^='Ajouter une note sur'], button[title^='Add Note about']",
      NEXT_PAGE_BUTTON: 'a[data-test-pagination-next]',
      CANDIDATE_LIST_ITEM: 'ol[data-test-paginated-list] li div[data-test-paginated-list-item]',
      CLOSE_OVERLAY: "base-slidein-container:not([data-test-base-slidein])",
      CLOSE_BUTTON: "a[data-test-close-pagination-header-button]",
    }
  },
  HELLOWORK: {
    BASE_URL: "https://app-recruteur.hellowork.com",
    CV_URL_PATTERN: "https://api-hwrecruteur.hellowork.com/api/hw-ats-public/api/cache/document/marvin/pdf/*",
    PATHS: {
      PROFILE: "/applicant/detail/",
      LIST: "/campaign/detail/",
      LIST_SEARCH_PARAM: "searchGuid=",
    },
    SELECTORS: {
      FILTERS: ".filters.filters-columns.filters-min-width",
      RESULT_LIST: "#result-list",
      CARD_IN_SHADOW_ROOT: "article > div.result-items.virtualizer > applicant-card",
      SHOW_MORE_BUTTON_IN_SHADOW_ROOT: "article > div.pagination > hw-button",
      AVATAR_DIV_IN_CARD_SHADOW_ROOT: "#avatarCheckboxDiv",
      LINK_IN_CARD_SHADOW_ROOT: 'a[href*="/applicant/detail/"]',
      EMAIL_BUTTON_IN_SHADOW_ROOT: "#contactEmail",
      PHONE_BUTTON_IN_SHADOW_ROOT: "hw-button#contactTel",
      EMAIL_COMPONENT_HOST: '#tools > contact-workflow',
      EMAIL_TO_APPLICANT_IN_SHADOW_ROOT: '#emailToApplicant',
      PHONE_COMPONENT: "tel-contact#telContact",
      PDF_VIEWER_HOST: "#documentViewer",
      PDF_VIEWER_IN_SHADOW_ROOT: "div > hw-pdf-viewer",
      PDF_INNER_VIEWER_IN_SHADOW_ROOT: "#viewer",
      CLOSE_BUTTON_IN_MODAL_SHADOW_ROOT: "#close",
    }
  }
};