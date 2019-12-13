import CrsWktExtension from './lib/extension/crsWkt';
import GeoPackageConnection from './lib/db/geoPackageConnection';
import WebPExtension from './lib/extension/webp';
import RTreeIndex from './lib/extension/rtree/rtreeIndex';
import MetadataExtension from './lib/extension/metadata';
import DataColumnsDao from './lib/dataColumns/dataColumnsDao';
import MediaTable from './lib/extension/relatedTables/mediaTable';
import UserMappingTable from './lib/extension/relatedTables/userMappingTable';
import DataColumnConstraintsDao from './lib/dataColumnConstraints/dataColumnConstraintsDao';
import FeatureColumn from './lib/features/user/featureColumn';
import UserColumn from './lib/user/userColumn';
import TileColumn from './lib/tiles/user/tileColumn';
import DataColumns from './lib/dataColumns/dataColumns';
import DataTypes from './lib/db/dataTypes'
import SchemaExtension from './lib/extension/schema';
import GeometryColumns from './lib/features/columns/geometryColumns';
import MetadataReference from './lib/metadata/reference/metadataReference';
import { GeometryData } from './lib/geom/geometryData';
import { TableCreator } from './lib/db/tableCreator';
import { DublinCoreType } from './lib/extension/relatedTables/dublinCoreType';
import { BoundingBox } from './lib/boundingBox';
import { GeoPackageAPI } from './lib/api';

var proj4Defs = require('./lib/proj4Defs');
var GeoPackageTileRetriever = require('./lib/tiles/retriever');
var TileUtilities = require('./lib/tiles/creator/tileUtilities');

var Metadata = require('./lib/metadata/metadata');
var FeatureTiles = require('./lib/tiles/features');
var NumberFeaturesTile = require('./lib/tiles/features/custom/numberFeaturesTile');
var ShadedFeaturesTile = require('./lib/tiles/features/custom/shadedFeaturesTile');

export {
  proj4Defs,
  GeoPackageAPI as GeoPackage,
  GeoPackageTileRetriever,
  GeoPackageConnection,
  TableCreator,
  MediaTable,
  UserMappingTable,
  DublinCoreType,
  TileColumn,
  TileUtilities,
  FeatureColumn,
  UserColumn,
  GeometryColumns,
  GeometryData,
  DataColumns,
  Metadata,
  MetadataReference,
  RTreeIndex,
  CrsWktExtension,
  SchemaExtension,
  MetadataExtension,
  WebPExtension,
  DataColumnsDao,
  DataColumnConstraintsDao,
  FeatureTiles,
  NumberFeaturesTile,
  ShadedFeaturesTile,
  BoundingBox,
  DataTypes
}