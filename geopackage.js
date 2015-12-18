var java = require('java')
  , mvn = require('node-java-maven')
  , proj4 = require('proj4')
  , async = require('async')
  , toArray = require('stream-to-array')
  , BufferStream = require('simple-bufferstream')
  , q = require('q');
  // this is necessary for the ImageIO calls within the GeoPackage library
  java.options.push("-Djava.awt.headless=true");

  Math.radians = function(degrees) {
    return degrees * Math.PI / 180;
  };

  Math.degrees = function(radians) {
    return radians * 180 / Math.PI;
  };

  function tile2lon(x,z) {
    return (x/Math.pow(2,z)*360-180);
  }

  function tile2lat(y,z) {
    var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
    return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
  }

  var getX = function(lon, zoom) {
    if (zoom == 0) return 0;
    var xtile = Math.floor((lon + 180) / 360 * (1 << zoom));
    return xtile;
  }

  var getY = function(lat, zoom) {
    if (zoom == 0) return 0;
    var ytile = Math.floor((1 - Math.log(Math.tan(Math.radians(parseFloat(lat))) + 1 / Math.cos(Math.radians(parseFloat(lat)))) / Math.PI) /2 * (1 << zoom));
    return ytile;
  }

  var xCalculator = function(bbox,z) {
  	var x = [];
  	var x1 = getX(Number(bbox[0]), z);
  	var x2 = getX(Number(bbox[2]), z);
  	x.max = Math.max(x1, x2);
  	x.min = Math.max(0,Math.min(x1, x2));
  	if (z == 0){
  		x.current = Math.min(x1, x2);
  	}
  	return x;
  }

  var yCalculator = function(bbox,z) {
  	var y = [];
  	var y1 = getY(Number(bbox[1]), z);
  	var y2 = getY(Number(bbox[3]), z);
  	y.max = Math.max(y1, y2);
  	y.min = Math.max(0,Math.min(y1, y2));
  	y.current = Math.min(y1, y2);
  	return y;
  }

  var tileBboxCalculator = function(x, y, z) {
    x = Number(x);
    y = Number(y);
    var tileBounds = {
      north: tile2lat(y, z),
      east: tile2lon(x+1, z),
      south: tile2lat(y+1, z),
      west: tile2lon(x, z)
    };

    return tileBounds;
  }

var GeoPackage = function(config) {
  config = config || {};
  this.featureDaos = {};
  this.tileDaos = {};
  this.tableProperties = {};
  this.initDefer = q.defer();
  this.initPromise = this.initDefer.promise;
  this.initialize();
  this.initPromise.then(function(self){
    // set up the log4j library to log to the console.
    var ConsoleAppender = java.import('org.apache.log4j.ConsoleAppender');
    var PatternLayout = java.import('org.apache.log4j.PatternLayout');
    var consoleAppender = new ConsoleAppender(); //create appender
    var PATTERN = "%d [%p|%c|%C{1}] %m%n";
    consoleAppender.setLayoutSync(new PatternLayout(PATTERN));
    consoleAppender.setThresholdSync(java.callStaticMethodSync('org.apache.log4j.Level', 'toLevel', config.log4jLevel || 'INFO'));
    consoleAppender.activateOptionsSync();
    java.callStaticMethodSync('org.apache.log4j.Logger', 'getRootLogger').addAppenderSync(consoleAppender);
  });
}

GeoPackage.prototype.initialize = function() {
  console.log('Initializing the GeoPackage with the package json', __dirname+'/package.json');
  var self = this;
  try {
    mvn({
      packageJsonPath: __dirname+'/package.json'
    }, function(err, mvnResults) {
      console.log('retrieved the maven atrifacts');
      if (err) {
        return console.error('could not resolve maven dependencies', err);
      }
      mvnResults.classpath.forEach(function(c) {
        console.log('adding ' + c + ' to classpath');
        java.classpath.push(c);
      });

      self.initialized = true;
      console.log('resolving promise');
      self.initDefer.resolve(self);
    });
  } catch (e) {
    console.error('e', e);
  }
}

GeoPackage.prototype.createAndOpenGeoPackageFile = function(filePath, callback) {
  console.log('opening geopackage ' + filePath);
  this.initPromise.then(function(self) {
    var File = java.import('java.io.File');
    var gpkgFile = new File(filePath);
    java.callStaticMethodSync('mil.nga.geopackage.manager.GeoPackageManager', 'create', gpkgFile);
    self.geoPackage = java.callStaticMethodSync('mil.nga.geopackage.manager.GeoPackageManager', 'open', gpkgFile);
    self.geoPackage.createTileMatrixSetTableSync();
    self.geoPackage.createTileMatrixTableSync();

    var srsDao = self.geoPackage.getSpatialReferenceSystemDaoSync();
    var srsWgs84 = srsDao.getOrCreateSync(4326);
    var srsEpsg3857 = srsDao.getOrCreateSync(3857);
    callback();
  }).done();
}

GeoPackage.prototype.openGeoPackageFile = function(filePath, callback) {
  console.log('opening geopackage ' + filePath);
  console.log('init promise', this.initPromise);
  this.initPromise.then(function(self) {
    console.log('promise inited');
    var File = java.import('java.io.File');
    var gpkgFile = new File(filePath);
    var canRead = gpkgFile.canReadSync();
    console.log('can read the geopackage file? ', canRead);
    self.geoPackage = java.callStaticMethodSync('mil.nga.geopackage.manager.GeoPackageManager', 'open', gpkgFile);
    callback();
  }).done();
}

GeoPackage.prototype.addTileToGeoPackage = function(tileStream, tableName, zoom, tileRow, tileColumn, callback) {
  this.initPromise.then(function(self) {
    var tileDao = self.tileDaos[tableName];

    var newRow = tileDao.newRowSync();
    newRow.setZoomLevelSync(java.newLong(zoom));
    newRow.setTileColumnSync(java.newLong(tileColumn));
    newRow.setTileRowSync(java.newLong(tileRow));

    toArray(tileStream, function (err, parts) {
      var byteArray = [];
      for (var k = 0; k < parts.length; k++) {
        var part = parts[k];
        for (var i = 0; i < part.length; i++) {
          var bufferPiece = part[i];
          var byte = java.newByte(bufferPiece);
          byteArray.push(byte);
        }
      }
      var bytes = java.newArray('byte', byteArray);
      newRow.setTileDataSync(bytes);
      tileDao.createSync(newRow);
      callback();
    });
  }).done();
}

GeoPackage.prototype.addFeaturesToGeoPackage = function(features, tableName, callback, progressCallback) {
  progressCallback = progressCallback || function(progress, callback) {
    callback(null);
  };
  console.log('adding %d features to geopackage table %s', features.length, tableName);
  this.initPromise.then(function(self) {
    var featureDao = self.featureDaos[tableName];
    var index = 0;
    var progress = {
      featuresAdded: 0,
      totalFeatures: features.length
    };
    async.eachSeries(features, function iterator(feature, featureComplete) {

      async.setImmediate(function() {
        var featureRow = featureDao.newRowSync();
        for (var propertyKey in feature.properties) {
          featureRow.setValue(self.tableProperties[tableName][propertyKey], ''+feature.properties[propertyKey]);
        }

        var featureGeometry = JSON.parse(feature.geometry);
        var geom = featureGeometry.coordinates;
        var type = featureGeometry.type;

        var geometryAddComplete = function() {
          featureDao.createSync(featureRow);
          progress.featuresAdded++;
          progressCallback(progress, function(err) {
            featureComplete(err, featureRow);
          });
        }

        if (type === 'Point') {
          self.addPoint(geom, featureRow, geometryAddComplete);
        } else if (type === 'MultiPoint') {
          self.addMultiPoint(geom, featureRow, geometryAddComplete);
        } else if (type === 'LineString') {
          self.addLine(geom, featureRow, geometryAddComplete);
        } else if (type === 'MultiLineString') {
          self.addMultiLine(geom, featureRow, geometryAddComplete);
        } else if (type === 'Polygon') {
          self.addPolygon(geom, featureRow, geometryAddComplete);
        } else if (type === 'MultiPolygon') {
          self.addMultiPolygon(geom, featureRow, geometryAddComplete);
        }

      });
    }, function done() {
      callback();
    });
  }).done();
}

GeoPackage.prototype.indexGeoPackage = function(tableName, featureCount, callback) {
  this.initPromise.then(function(self) {
    var featureDao = self.featureDaos[tableName];
    var FeatureTableIndex = java.import('mil.nga.geopackage.extension.index.FeatureTableIndex');
    var featureTableIndex = new FeatureTableIndex(self.geoPackage, featureDao);

    var indexedFeatures = 0;
    var max = featureCount;
    var progress = java.newProxy('mil.nga.geopackage.io.GeoPackageProgress', {
      setMax: function(max) { },
      addProgress: function(progress) {
        console.log('features indexed:', indexedFeatures++);
      },
      isActive: function() {
        return indexedFeatures < featureCount;
      },
      cleanupOnCancel: function() {
        return false;
      }
    });

    featureTableIndex.setProgress(progress);
  	featureTableIndex.index(function(err, indexCount) {
      console.log('finished indexing %d features', indexCount);
      callback();
    });
  }).done();
}

GeoPackage.prototype.addPoint = function(point, featureRow, callback) {
  this.initPromise.then(function(self) {
    var GeoPackageGeometryData = java.import('mil.nga.geopackage.geom.GeoPackageGeometryData');
    var geometryData = new GeoPackageGeometryData(3857);
    geometryData.setGeometrySync(self.createPoint(point));
    featureRow.setGeometrySync(geometryData);
    callback();
  }).done();
}

GeoPackage.prototype.addMultiPoint = function(multiPoint, featureRow, callback) {
  this.initPromise.then(function(self) {
    var GeoPackageGeometryData = java.import('mil.nga.geopackage.geom.GeoPackageGeometryData');

    var geometryData = new GeoPackageGeometryData(3857);
    geometryData.setGeometrySync(self.createMultiPoint(multiPoint));
    featureRow.setGeometrySync(geometryData);
    callback();
  }).done();
}

GeoPackage.prototype.addLine = function(line, featureRow, callback) {
  this.initPromise.then(function(self) {
    var GeoPackageGeometryData = java.import('mil.nga.geopackage.geom.GeoPackageGeometryData');

    var geometryData = new GeoPackageGeometryData(3857);
    geometryData.setGeometrySync(self.createLine(line));
    featureRow.setGeometrySync(geometryData);
    callback();
  }).done();
}

GeoPackage.prototype.addMultiLine = function(multiLine, featureRow, callback) {
  this.initPromise.then(function(self) {
    var GeoPackageGeometryData = java.import('mil.nga.geopackage.geom.GeoPackageGeometryData');

    var geometryData = new GeoPackageGeometryData(3857);
    geometryData.setGeometrySync(self.createMultiLine(multiLine));
    featureRow.setGeometrySync(geometryData);
    callback();
  }).done();
}

GeoPackage.prototype.addPolygon = function(polygon, featureRow, callback) {
  this.initPromise.then(function(self) {
    var GeoPackageGeometryData = java.import('mil.nga.geopackage.geom.GeoPackageGeometryData');

    var geometryData = new GeoPackageGeometryData(3857);
    geometryData.setGeometrySync(self.createPolygon(polygon));
    featureRow.setGeometrySync(geometryData);
    callback();
  }).done();
}

GeoPackage.prototype.addMultiPolygon = function(multiPolygon, featureRow, callback) {
  this.initPromise.then(function(self) {
    var GeoPackageGeometryData = java.import('mil.nga.geopackage.geom.GeoPackageGeometryData');

    var geometryData = new GeoPackageGeometryData(3857);
    geometryData.setGeometrySync(self.createMultiPolygon(multiPolygon));
    featureRow.setGeometrySync(geometryData);
    callback();
  }).done();
}

GeoPackage.prototype.getFeatureTables = function(callback) {
  this.initPromise.then(function(self) {
    var featureTables = self.geoPackage.getFeatureTablesSync();
    callback(null, featureTables);
  });
}

GeoPackage.prototype.iterateFeaturesFromTable = function(table, featureCallback, doneCallback) {
  this.initPromise.then(function(self) {

    var dataColumnsDao = self.geoPackage.getDataColumnsDaoSync();

    var columnMap = {};

    var featureDao = self.geoPackage.getFeatureDaoSync(table);
    var featureTable = featureDao.getTableSync();
    var columnNames = featureTable.getColumnNamesSync();

    for (var i = 0; i < columnNames.length; i++) {
      var dc = dataColumnsDao.getDataColumnSync(table, columnNames[i]);
      if (dc) {
        columnMap[columnNames[i]] = dc.getNameSync();
      }
    }

    var featureResultSet = featureDao.queryForAllSync();
    async.whilst(
      function() {
        var move = featureResultSet.moveToNextSync();
        return move;
      },
      function(callback) {
        var row = featureResultSet.getRowSync();

        self._rowToJson(row, columnMap, function(err, json) {
          featureCallback(null, json, callback);
        });
      },
      function(err) {
        featureResultSet.closeSync();
        doneCallback();
      }
    )
  });
}

GeoPackage.prototype._rowToJson = function(row, columnMap, callback) {
  var jsonRow = {
    properties: { },
    geometry: { }
  };

  var columnNames = row.getColumnNamesSync();
  var values = row.getValuesSync();
  var pkIndex = row.getPkColumnIndexSync();
  var geometryIndex = row.getGeometryColumnIndexSync();

  for (var i = 0; i < values.length; i++) {
    if (i == pkIndex || i == geometryIndex) {
      // ignore these fields
    } else if (values[i] != null && values[i] != 'null') {
      jsonRow.properties[columnMap[columnNames[i]]] = values[i];
    }
  }

  var gpkgGeometryData = row.getGeometrySync();
  var srsId = gpkgGeometryData.getSrsIdSync();
  var projection = java.callStaticMethodSync('mil.nga.geopackage.projection.ProjectionFactory', 'getProjection', srsId);
  var transformation = projection.getTransformationSync(4326);
  var geometry = gpkgGeometryData.getGeometrySync();

  var type = geometry.getGeometryTypeSync().nameSync();

  var geomCoordinates;
  switch (type) {
    case 'POINT':
      jsonRow.geometry.type = 'Point';
      jsonRow.geometry.coordinates = this.readPoint(geometry, transformation);
      break;
    case 'MULTIPOINT':
      jsonRow.geometry.type = 'MultiPoint';
      jsonRow.geometry.coordinates = this.readMultiPoint(geometry, transformation);
      break;
    case 'LINESTRING':
      jsonRow.geometry.type = 'LineString';
      jsonRow.geometry.coordinates = this.readLine(geometry, transformation);
      break;
    case 'MULTILINESTRING':
      jsonRow.geometry.type = 'MultiLineString';
      jsonRow.geometry.coordinates = this.readMultiLine(geometry, transformation);
      break;
    case 'POLYGON':
      jsonRow.geometry.type = 'Polygon';
      jsonRow.geometry.coordinates = this.readPolygon(geometry, transformation);
      break;
    case 'MULTIPOLYGON':
      jsonRow.geometry.type = 'MultiPolygon';
      jsonRow.geometry.coordinates = this.readMultiPolygon(geometry, transformation);
      break;
  }

  callback(null, jsonRow);
}

GeoPackage.prototype.getTileTables = function(callback) {
  this.initPromise.then(function(self) {
    var tileTables = self.geoPackage.getTileTablesSync();
    callback(null, tileTables);
  });
}

GeoPackage.prototype.getTileFromTable = function(table, z, x, y, callback) {
  this.initPromise.then(function(self) {
    var tileDao = self.geoPackage.getTileDaoSync(table);
    var maxZoom = tileDao.getMaxZoomSync();
    var minZoom = tileDao.getMinZoomSync();

    try {
      var bytes = java.callStaticMethodSync('mil.nga.geopackage.tiles.TileDraw', 'drawTileBytes', self.geoPackage, table, 'png', java.newLong(x), java.newLong(y), java.newLong(z));
      var buffer = new Buffer(bytes);
      callback(null, BufferStream(buffer));
    } catch (e) {
      console.log('e', e);
    }
  });
}

GeoPackage.prototype.createTileTable = function(extent, tableName, minZoom, maxZoom, callback) {
  this.initPromise.then(function(self) {
    var TileTable = java.import('mil.nga.geopackage.tiles.user.TileTable');
    var columns = java.callStaticMethodSync('mil.nga.geopackage.tiles.user.TileTable', 'createRequiredColumns');
    var tileTable = new TileTable(tableName, columns);

    self.geoPackage.createTileTableSync(tileTable);

    var xRangeMinZoom = xCalculator(extent, minZoom);
    var yRangeMinZoom = yCalculator(extent, minZoom);

    var llCorner = tileBboxCalculator(xRangeMinZoom.min, yRangeMinZoom.max, minZoom);
    var urCorner = tileBboxCalculator(xRangeMinZoom.max, yRangeMinZoom.min, minZoom);
    var totalTileExtent = [llCorner.west, llCorner.south, urCorner.east, urCorner.north];
    console.log('ur ', urCorner);
    console.log('yrange', yRangeMinZoom);
    console.log('xrange', xRangeMinZoom);

    var epsg3857ll = proj4('EPSG:3857', [llCorner.west, llCorner.south]);
    var epsg3857ur = proj4('EPSG:3857', [urCorner.east, urCorner.north]);
    console.log('epsgur', epsg3857ur);


    // Create new Contents
    var Contents = java.import('mil.nga.geopackage.core.contents.Contents');
    var contents = new Contents();
    contents.setTableNameSync(tableName);
    contents.setDataTypeSync(java.callStaticMethodSync('mil.nga.geopackage.core.contents.ContentsDataType', 'fromName', 'tiles'));
    contents.setIdentifierSync(tableName);

    var srsDao = self.geoPackage.getSpatialReferenceSystemDaoSync();
    var srsWgs84 = srsDao.getOrCreateSync(4326);

    var Date = java.import('java.util.Date');
    contents.setLastChange(new Date());
    contents.setMinXSync(java.newDouble(llCorner.west));
    contents.setMinYSync(java.newDouble(llCorner.south));
    contents.setMaxXSync(java.newDouble(urCorner.east));
    contents.setMaxYSync(java.newDouble(urCorner.north));
    contents.setSrsSync(srsWgs84);

    // Create the contents
    self.geoPackage.getContentsDaoSync().createSync(contents);

    // Create new Tile Matrix Set
    var tileMatrixSetDao = self.geoPackage.getTileMatrixSetDaoSync();

    var srsDao = self.geoPackage.getSpatialReferenceSystemDaoSync();
    var srsEpsg3857 = srsDao.getOrCreateSync(3857);

    var TileMatrixSet = java.import('mil.nga.geopackage.tiles.matrixset.TileMatrixSet');
    var tileMatrixSet = new TileMatrixSet();
    tileMatrixSet.setContentsSync(contents);
    tileMatrixSet.setSrsSync(srsEpsg3857);
    tileMatrixSet.setMinXSync(java.newDouble(epsg3857ll[0]));
    tileMatrixSet.setMinYSync(java.newDouble(epsg3857ll[1]));
    tileMatrixSet.setMaxXSync(java.newDouble(epsg3857ur[0]));
    tileMatrixSet.setMaxYSync(java.newDouble(epsg3857ur[1]));
    tileMatrixSetDao.createSync(tileMatrixSet);

    // Create new Tile Matrix and tile table rows by going through each zoom
    // level
    var tileMatrixDao = self.geoPackage.getTileMatrixDaoSync();
    self.tileDaos[tableName] = self.geoPackage.getTileDaoSync(tileMatrixSet);


    for (var zoom = minZoom; zoom <= maxZoom; zoom++) {
      var xRange = xCalculator(totalTileExtent, zoom);
      var yRange = yCalculator(totalTileExtent, zoom);

      var matrixWidth = ((xRangeMinZoom.max - xRangeMinZoom.min) + 1) * Math.pow(2,(zoom - minZoom));
      var matrixHeight = ((yRangeMinZoom.max - yRangeMinZoom.min) + 1) * Math.pow(2,(zoom - minZoom));

      console.log('zoom: %d, matrixheight: %d, matrixwidth: %d', zoom, matrixHeight, matrixWidth);

      var pixelXSize = ((epsg3857ur[0] - epsg3857ll[0]) / matrixWidth) / 256;
      var pixelYSize = ((epsg3857ur[1] - epsg3857ll[1]) / matrixHeight) / 256;

      var TileMatrix = java.import('mil.nga.geopackage.tiles.matrix.TileMatrix');
      var tileMatrix = new TileMatrix();
      tileMatrix.setContentsSync(contents);
      tileMatrix.setZoomLevelSync(java.newLong(zoom));
      tileMatrix.setMatrixWidthSync(java.newLong(matrixWidth));
      tileMatrix.setMatrixHeightSync(java.newLong(matrixHeight));
      tileMatrix.setTileWidthSync(java.newLong(256));
      tileMatrix.setTileHeightSync(java.newLong(256));
      tileMatrix.setPixelXSizeSync(java.newDouble(pixelXSize));
      tileMatrix.setPixelYSizeSync(java.newDouble(pixelYSize));
      tileMatrixDao.createSync(tileMatrix);
    }
    callback();
  }).done();

}

GeoPackage.prototype.addTileMatrices = function(extent, tableName, minZoom, maxZoom, callback) {
  this.initPromise.then(function(self) {
    var xRangeMinZoom = xCalculator(extent, minZoom);
    var yRangeMinZoom = yCalculator(extent, minZoom);

    var llCorner = tileBboxCalculator(xRangeMinZoom.min, yRangeMinZoom.max, minZoom);
    var urCorner = tileBboxCalculator(xRangeMinZoom.max, yRangeMinZoom.min, minZoom);
    var totalTileExtent = [llCorner.west, llCorner.south, urCorner.east, urCorner.north];
    var tileMatrixDao = self.geoPackage.getTileMatrixDaoSync();

    for (var zoom = minZoom; zoom <= maxZoom; zoom++) {
      var xRange = xCalculator(totalTileExtent, zoom);
      var yRange = yCalculator(totalTileExtent, zoom);

      var matrixWidth = ((xRangeMinZoom.max - xRangeMinZoom.min) + 1) * Math.pow(2,(zoom - minZoom));
      var matrixHeight = ((yRangeMinZoom.max - yRangeMinZoom.min) + 1) * Math.pow(2,(zoom - minZoom));

      console.log('zoom: %d, matrixheight: %d, matrixwidth: %d', zoom, matrixHeight, matrixWidth);

      var pixelXSize = ((epsg3857ur[0] - epsg3857ll[0]) / matrixWidth) / 256;
      var pixelYSize = ((epsg3857ur[1] - epsg3857ll[1]) / matrixHeight) / 256;

      var TileMatrix = java.import('mil.nga.geopackage.tiles.matrix.TileMatrix');
      var tileMatrix = new TileMatrix();
      tileMatrix.setContentsSync(contents);
      tileMatrix.setZoomLevelSync(java.newLong(zoom));
      tileMatrix.setMatrixWidthSync(java.newLong(matrixWidth));
      tileMatrix.setMatrixHeightSync(java.newLong(matrixHeight));
      tileMatrix.setTileWidthSync(java.newLong(256));
      tileMatrix.setTileHeightSync(java.newLong(256));
      tileMatrix.setPixelXSizeSync(java.newDouble(pixelXSize));
      tileMatrix.setPixelYSizeSync(java.newDouble(pixelYSize));
      tileMatrixDao.createSync(tileMatrix);
    }
    callback();
  }).done();
}

GeoPackage.prototype.createFeatureTable = function(extent, tableName, propertyColumnNames, callback) {
  console.log('creating feature table', tableName);
  this.initPromise.then(function(self) {
    var ArrayList = java.import('java.util.ArrayList');
    var FeatureTable = java.import('mil.nga.geopackage.features.user.FeatureTable');
    var Date = java.import('java.util.Date');
    var GeometryColumns = java.import('mil.nga.geopackage.features.columns.GeometryColumns');
    var BoundingBox = java.import('mil.nga.geopackage.BoundingBox');
    var Contents = java.import('mil.nga.geopackage.core.contents.Contents');
    var DataColumns = java.import('mil.nga.geopackage.schema.columns.DataColumns');

    var srsDao = self.geoPackage.getSpatialReferenceSystemDaoSync();
    var srsEpsg3857 = srsDao.getOrCreateSync(3857);

    self.geoPackage.createGeometryColumnsTableSync();

    var columns = new ArrayList();
    columns.addSync(java.callStaticMethodSync('mil.nga.geopackage.features.user.FeatureColumn', 'createPrimaryKeyColumn', 0, 'id'));
    columns.addSync(java.callStaticMethodSync('mil.nga.geopackage.features.user.FeatureColumn', 'createGeometryColumn', 1, 'geom', java.callStaticMethodSync('mil.nga.wkb.geom.GeometryType', 'fromName', 'GEOMETRY'), false, null));
    self.tableProperties[tableName] = {};
    for (var i = 0; i < propertyColumnNames.length; i++) {
      self.tableProperties[tableName][propertyColumnNames[i]] = 'property_'+i;
      columns.addSync(java.callStaticMethodSync('mil.nga.geopackage.features.user.FeatureColumn', 'createColumn', i+2, 'property_'+i, java.callStaticMethodSync('mil.nga.geopackage.db.GeoPackageDataType', 'fromName', 'TEXT'), false, null));
    }

    var featureTable = new FeatureTable(tableName, columns);
    self.geoPackage.createFeatureTableSync(featureTable);

    var epsg3857ll = proj4('EPSG:3857', [extent[0], extent[1]]);
    var epsg3857ur = proj4('EPSG:3857', [extent[2], extent[3]]);
    var contents = new Contents();
    contents.setTableNameSync(tableName);
    contents.setDataTypeSync(java.callStaticMethodSync('mil.nga.geopackage.core.contents.ContentsDataType', 'fromName', 'features'));
    contents.setIdentifierSync(tableName);
    // contents.setDescription("");
    contents.setLastChange(new Date());
    contents.setMinXSync(java.newDouble(epsg3857ll[0]));
    contents.setMinYSync(java.newDouble(epsg3857ll[1]));
    contents.setMaxXSync(java.newDouble(epsg3857ur[0]));
    contents.setMaxYSync(java.newDouble(epsg3857ur[1]));
    contents.setSrsSync(srsEpsg3857);
    self.geoPackage.getContentsDaoSync().createSync(contents);


    var geometryColumns = new GeometryColumns();
    geometryColumns.setContentsSync(contents);
    geometryColumns.setSrsSync(contents.getSrsSync());
    geometryColumns.setGeometryTypeSync(java.callStaticMethodSync('mil.nga.wkb.geom.GeometryType', 'fromName', 'GEOMETRY'));
    geometryColumns.setColumnNameSync('geom');
    self.geoPackage.getGeometryColumnsDaoSync().create(geometryColumns);

    self.featureDaos[tableName] = self.geoPackage.getFeatureDaoSync(geometryColumns);

    self.geoPackage.createDataColumnsTableSync();

    var dataColumnsDao = self.geoPackage.getDataColumnsDaoSync();

    for (var i = 0; i < propertyColumnNames.length; i++) {
      var dataColumns = new DataColumns();
    	dataColumns.setContentsSync(contents);
    	dataColumns.setColumnNameSync('property_'+i);
    	dataColumns.setNameSync(propertyColumnNames[i]);
    	dataColumns.setTitleSync(propertyColumnNames[i]);
    	dataColumns.setDescriptionSync(propertyColumnNames[i]);

    	dataColumnsDao.createSync(dataColumns);
    }

    callback();

  }).done();
}

GeoPackage.prototype.readPoint = function(point, transformation) {
  return transformation.transformSync(point.getXSync(), point.getYSync());
}

GeoPackage.prototype.createPoint = function(point) {
  var Point = java.import('mil.nga.wkb.geom.Point');
  return new Point(java.newDouble(point[0]), java.newDouble(point[1]));
}

GeoPackage.prototype.readMultiPoint = function(multiPoint, transformation) {
  var points = multiPoint.getPointsSync();
  var numPoints = multiPoint.numPointsSync();
  var jsonPoints = [];
  for (var i = 0; i < numPoints; i++) {
    jsonPoints.push(this.readPoint(points.getSync(i), transformation));
  }
  return jsonPoints;
}

GeoPackage.prototype.createMultiPoint = function(multiPoint) {
  var MultiPoint = java.import('mil.nga.wkb.geom.MultiPoint');

  var multiPointGeom = new MultiPoint(false, false);
  for (var i = 0; i < multiPoint.length; i++) {
    multiPointGeom.addPointSync(this.createPoint(multiPoint[i]));
  }
  return multiPointGeom;
}

GeoPackage.prototype.readLine = function(line, transformation) {
  var points = line.getPointsSync();
  var numPoints = line.numPointsSync();
  var jsonPoints = [];
  for (var i = 0; i < numPoints; i++) {
    jsonPoints.push(this.readPoint(points.getSync(i), transformation));
  }
  return jsonPoints;
}

GeoPackage.prototype.createLine = function(line) {
  var LineString = java.import('mil.nga.wkb.geom.LineString');

  var lineGeom = new LineString(false, false);
  for (var i = 0; i < line.length; i++) {
    var point = line[i];
    if (point[0] == null || point[1] == null) continue;
    lineGeom.addPointSync(this.createPoint(point));
  }
  return lineGeom;
}

GeoPackage.prototype.readMultiLine = function(multiLine, transformation) {
  var lineStrings = multiLine.getLineStringsSync();
  var numStrings = multiLine.numLineStringsSync();
  var jsonLines = [];
  for (var i = 0; i < numStrings; i++) {
    var line = lineStrings.getSync(i);
    jsonLines.push(this.readLine(line, transformation));
  }
  return jsonLines;
}

GeoPackage.prototype.createMultiLine = function(multiLine) {
  var MultiLineString = java.import('mil.nga.wkb.geom.MultiLineString');

  var multiLineGeom = new MultiLineString(false, false);
  for (var i = 0; i < multiLine.length; i++) {
    var line = multiLine[i];
    multiLineGeom.addLineStringSync(this.createLine(line));
  }
  return multiLineGeom;
}

GeoPackage.prototype.readPolygon = function(polygon, transformation) {
  var rings = polygon.getRingsSync();
  var numRings = polygon.getNumRingsSync();
  var jsonRings = [];
  for (var i = 0; i < numRings; i++) {
    var ring = rings.getSync(i);
    jsonRings.push(this.readLine(ring, transformation));
  }
  return jsonRings;
}

GeoPackage.prototype.createPolygon = function(polygon) {
  var Polygon = java.import('mil.nga.wkb.geom.Polygon');
  var polygonGeom = new Polygon(false, false);
  for (var ring = 0; ring < polygon.length; ring++) {
    var linearRing = polygon[ring];
    polygonGeom.addRingSync(this.createLine(linearRing));
  }
  return polygonGeom;
}

GeoPackage.prototype.readMultiPolygon = function(multiPolygon, transformation) {
  var polygons = multiPolygon.getPolygonsSync();
  var numPolygons = multiPolygon.getNumPolygonsSync();
  var jsonPolygons = [];
  for (var i = 0; i < numPolygons; i++) {
    var polygon = polygons.getSync(i);
    jsonPolygons.push(this.readPolygon(polygon, transformation));
  }
  return jsonPolygons;
}

GeoPackage.prototype.createMultiPolygon = function(multiPolygon) {
  var MultiPolygon = java.import('mil.nga.wkb.geom.MultiPolygon');

  var multiPolygonGeom = new MultiPolygon(false, false);
  for (var polygon = 0; polygon < multiPolygon.length; polygon++) {
    multiPolygonGeom.addPolygonSync(this.createPolygon(multiPolygon[polygon]));
  }
  return multiPolygonGeom;
}

module.exports = GeoPackage;
