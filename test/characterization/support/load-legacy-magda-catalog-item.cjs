"use strict";

const Module = require("node:module");
const path = require("node:path");

function promise(value) {
  return Promise.resolve(value);
}
promise.any = (values) => Promise.any(values);

if (!Promise.prototype.otherwise) {
  Object.defineProperty(Promise.prototype, "otherwise", {
    configurable: true,
    value: Promise.prototype.catch
  });
}

class UriImpl {
  constructor(value) {
    this.value = new URL(value);
  }

  clone() {
    return new UriImpl(this.toString());
  }

  protocol() {
    return this.value.protocol.replace(/:$/, "");
  }

  hostname() {
    return this.value.hostname;
  }

  segment(value) {
    if (value === undefined) return this.segmentCoded();
    return this.segmentCoded(this.segmentCoded().concat(String(value).split("/")));
  }

  segmentCoded(value) {
    if (value === undefined) {
      return this.value.pathname.split("/").filter(Boolean);
    }
    this.value.pathname = `/${value.filter(Boolean).join("/")}`;
    return this;
  }

  addQuery(values) {
    Object.entries(values).forEach(([key, value]) => {
      this.value.searchParams.set(key, String(value));
    });
    return this;
  }

  search(value) {
    if (value === true) return Object.fromEntries(this.value.searchParams.entries());
    if (value === "") {
      this.value.search = "";
      return this;
    }
    if (value && typeof value === "object") {
      this.value.search = "";
      Object.entries(value).forEach(([key, entry]) => {
        this.value.searchParams.set(key, String(entry));
      });
      return this;
    }
    return this.value.search;
  }

  toString() {
    return this.value.toString();
  }
}

function Uri(value) {
  return new UriImpl(value);
}
Uri.prototype = UriImpl.prototype;

function CatalogItem(terria) {
  this.terria = terria;
  this.info = [];
  this.uniqueId = "legacy-magda-item";
  this.datasetBucket = this.datasetBucket || "magda-datasets";
}
CatalogItem.defaultUpdaters = {};
CatalogItem.defaultSerializers = {};
CatalogItem.prototype.updateFromJson = function updateFromJson(properties) {
  Object.assign(this, properties);
};

function catalogItemType(type) {
  function Item(terria) {
    CatalogItem.call(this, terria);
    this.__type = type;
  }
  Item.prototype = Object.create(CatalogItem.prototype);
  Item.prototype.constructor = Item;
  return Item;
}

const modelTypes = {
  "terriajs/lib/Models/ArcGisFeatureServerCatalogItem": catalogItemType("esri-featureServer"),
  "terriajs/lib/Models/ArcGisMapServerCatalogItem": catalogItemType("esri-mapServer"),
  "terriajs/lib/Models/CsvCatalogItem": catalogItemType("csv"),
  "terriajs/lib/Models/CzmlCatalogItem": catalogItemType("czml"),
  "terriajs/lib/Models/GeoJsonCatalogItem": catalogItemType("geojson"),
  "terriajs/lib/Models/KmlCatalogItem": catalogItemType("kml"),
  "terriajs/lib/Models/WebMapServiceCatalogItem": catalogItemType("wms"),
  "terriajs/lib/Models/WebFeatureServiceCatalogItem": catalogItemType("wfs")
};

function groupType(type) {
  return function Group(terria) {
    CatalogItem.call(this, terria);
    this.__type = type;
    this.items = (terria && terria.__groupItems) || [];
    this.load = () => promise(this);
  };
}

let loadJsonImplementation = () => promise({});

class TerriaError extends Error {
  constructor(options) {
    super(options.message);
    Object.assign(this, options);
  }
}

const stubs = {
  ...modelTypes,
  "terriajs/lib/Models/CatalogItem": CatalogItem,
  "terriajs/lib/Models/WebMapServiceCatalogGroup": groupType("wms-group"),
  "terriajs/lib/Models/WebFeatureServiceCatalogGroup": groupType("wfs-group"),
  "terriajs/lib/Core/loadJson": (url) => loadJsonImplementation(url),
  "terriajs/lib/Core/TerriaError": TerriaError,
  "terriajs/lib/Models/Metadata": function Metadata() {},
  "terriajs/lib/Models/proxyCatalogItemUrl": (_item, url) => url,
  "terriajs/lib/Core/inherit": (Parent, Child) => {
    Child.prototype = Object.create(Parent.prototype);
    Child.prototype.constructor = Child;
  },
  "terriajs/lib/Models/createRegexDeserializer": () => () => {},
  "terriajs/lib/Models/createRegexSerializer": () => () => {},
  "terriajs-cesium/Source/Core/clone": (value) => ({ ...value }),
  "terriajs-cesium/Source/Core/defined": (value) => value !== undefined && value !== null,
  "terriajs-cesium/Source/Core/defineProperties": Object.defineProperties,
  "terriajs-cesium/Source/Core/freezeObject": Object.freeze,
  "terriajs-cesium/Source/ThirdParty/when": promise,
  "terriajs-cesium/Source/ThirdParty/knockout": {
    getObservable: (item) => ({
      subscribe(callback) {
        item.__setIsLoading = callback;
      }
    })
  },
  urijs: Uri
};

const originalLoad = Module._load;
Module._load = function loadWithLegacyStubs(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return originalLoad.call(this, request, parent, isMain);
};

let MagdaCatalogItem;
try {
  MagdaCatalogItem = require(path.resolve(
    __dirname,
    "../../../lib/Models/MagdaCatalogItem.js"
  ));
} finally {
  Module._load = originalLoad;
}

module.exports = {
  MagdaCatalogItem,
  TerriaError,
  createNativeItem(type, properties = {}) {
    const Model = Object.values(modelTypes).find((Candidate) => {
      const item = new Candidate({});
      return item.__type === type;
    });
    return Object.assign(new Model({}), properties);
  },
  setLoadJson(implementation) {
    loadJsonImplementation = implementation;
  }
};
