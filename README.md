# GeoPackage JS

### Demo ###
[GeoPackage JS Demo Page](http://ngageoint.github.io/geopackage-js/)

Cloning this repository and opening the demo/browserify/index.html in your browser will run the demo locally.

#### GeoPackage JS Library ####

The [GeoPackage Libraries](http://ngageoint.github.io/GeoPackage/) were developed at the [National Geospatial-Intelligence Agency (NGA)](http://www.nga.mil/) in collaboration with [BIT Systems](http://www.bit-sys.com/). The government has "unlimited rights" and is releasing this software to increase the impact of government investments by providing developers with the opportunity to take things in new directions. The software use, modification, and distribution rights are stipulated within the [MIT license](http://choosealicense.com/licenses/mit/).

### Pull Requests ###
If you'd like to contribute to this project, please make a pull request. We'll review the pull request and discuss the changes. All pull request contributions to this project will be released under the MIT license.

Software source code previously released under an open source license and then modified by NGA staff is considered a "joint work" (see 17 USC § 101); it is partially copyrighted, partially public domain, and as a whole is protected by the copyrights of the non-government authors and must be released according to the terms of the original open source license.

### About ###

[GeoPackage JS](https://github.com/ngageoint/geopackage-js) is a [GeoPackage Library](http://ngageoint.github.io/GeoPackage/) JavaScript implementation of the Open Geospatial Consortium [GeoPackage](http://www.geopackage.org/) [spec](http://www.geopackage.org/spec/).  It is listed as an [OGC GeoPackage Implementation](http://www.geopackage.org/#implementations_nga) by the National Geospatial-Intelligence Agency.

The GeoPackage JavaScript library currently provides the ability to read GeoPackage files.  This library works both in the browser and in Node.  In the browser tiles are rendered using HTML5 Canvas and GeoPackages are read using [sql.js](https://github.com/kripken/sql.js/).  In Node tiles are rendered using [Light Weight Image Processor for NodeJS](https://github.com/EyalAr/lwip) and GeoPackages are read using [node-sqlite3](https://github.com/mapbox/node-sqlite3).

### Usage ###

View examples using [Bower](tree/master/demo/bower) and [Browserify](tree/master/demo/browserify)

View the latest [docs](http://ngageoint.github.io/geopackage-js/docs/module-geoPackage-GeoPackage.html) (currently being updated).

#### Browser Usage ####
```javascript

// attach this method to a file input onchange event
window.loadGeoPackage = function(files) {
  var f = files[0];
  var r = new FileReader();
  r.onload = function() {
    var array = new Uint8Array(r.result);
    loadByteArray(array);
  }
  r.readAsArrayBuffer(f);
}

function loadByteArray(array, callback) {
  var db = new SQL.Database(array);
  GeoPackageConnection.connectWithDatabase(db, function(err, connection) {
    var geoPackage = new GeoPackage('', '', connection);

    // Now you can operate on the GeoPackage

    // get the tile table names
    geoPackage.getTileTables(function(err, tileTableNames) {
      // tileTableNames is an array of all tile table names

      // get the info for the first table
      geoPackage.getTileDaoWithTableName(tileTableNames[0], function(err, tileDao) {
        geoPackage.getInfoForTable(tileDao, function(err, info) {
          // do something with the tile table info
        });

        // draw a tile into a canvas for an XYZ tile
        var canvas = canvasFromSomewhere;
        var gpr = new GeoPackageTileRetriever(tileDao, 256, 256);
        var x = 0;
        var y = 0;
        var zoom = 0;

        console.time('Draw tile ' + x + ', ' + y + ' zoom: ' + zoom);
        gpr.drawTileIn(x, y, zoom, canvas, function() {
          console.timeEnd('Draw tile ' + x + ', ' + y + ' zoom: ' + zoom);
        });

        // or get a tile base64 data URL for an XYZ tile
        gpr.getTile(x, y, zoom, function(err, tileBase64DataURL) {
          console.log('got the base64 data url');
        });

        // or get a tile from a GeoPackage tile column and tile row
        tileDao.queryForTile(tileColumn, tileRow, zoom, function(err, tile) {
          var tileData = tile.getTileData();  // the raw bytes from the GeoPackage
        });

      });
    });

    // get the feature table names
    geoPackage.getFeatureTables(function(err, featureTableNames) {
      // featureTableNames is an array of all feature table names

      // get the info for the first table
      geoPackage.getFeatureDaoWithTableName(featureTableNames[0], function(err, featureDao) {
        geoPackage.getInfoForTable(featureDao, function(err, info) {
          // do something with the feature table info
        });

        // query for all features
        featureDao.queryForEach(function(err, row, rowDone) {
          var feature = featureDao.getFeatureRow(row);
          var geometry = currentRow.getGeometry();
          if (geometry) {
            var geom = geometry.geometry;
            var geoJson = geometry.geometry.toGeoJSON();

            geoJson.properties = {};
            for (var key in feature.values) {
              if(feature.values.hasOwnProperty(key) && key != feature.getGeometryColumn().name) {
                var column = info.columnMap[key];
                geoJson.properties[column.displayName] = currentRow.values[key];
              }
            }
          }
          rowDone();
        });
      });
    });
  });
}

```

#### NodeJS Usage ####

```javascript
var geopackage = require('geopackage')
  , GeoPackageManager = geopackage.GeoPackageManager
  , GeoPackageConnection = geopackage.GeoPackageConnection
  , GeoPackageTileRetriever = geopackage.GeoPackageTileRetriever;

GeoPackageManager.open(filename, function(err, geoPackage) {

  // Now you can operate on the GeoPackage

  // get the tile table names
  geoPackage.getTileTables(function(err, tileTableNames) {
    // tileTableNames is an array of all tile table names

    // get the info for the first table
    geoPackage.getTileDaoWithTableName(tileTableNames[0], function(err, tileDao) {
      geoPackage.getInfoForTable(tileDao, function(err, info) {
        // do something with the tile table info
      });

      // draw a tile into a canvas for an XYZ tile
      var canvas = canvasFromSomewhere;
      var gpr = new GeoPackageTileRetriever(tileDao, 256, 256);
      var x = 0;
      var y = 0;
      var zoom = 0;

      console.time('Draw tile ' + x + ', ' + y + ' zoom: ' + zoom);
      gpr.drawTileIn(x, y, zoom, canvas, function() {
        console.timeEnd('Draw tile ' + x + ', ' + y + ' zoom: ' + zoom);
      });

      // or get a tile base64 data URL for an XYZ tile
      gpr.getTile(x, y, zoom, function(err, tileBase64DataURL) {
        console.log('got the base64 data url');
      });

      // or get a tile from a GeoPackage tile column and tile row
      tileDao.queryForTile(tileColumn, tileRow, zoom, function(err, tile) {
        var tileData = tile.getTileData();  // the raw bytes from the GeoPackage
      });

    });
  });

  // get the feature table names
  geoPackage.getFeatureTables(function(err, featureTableNames) {
    // featureTableNames is an array of all feature table names

    // get the info for the first table
    geoPackage.getFeatureDaoWithTableName(featureTableNames[0], function(err, featureDao) {
      geoPackage.getInfoForTable(featureDao, function(err, info) {
        // do something with the feature table info
      });

      // query for all features
      featureDao.queryForEach(function(err, row, rowDone) {
        var feature = featureDao.getFeatureRow(row);
        var geometry = currentRow.getGeometry();
        if (geometry) {
          var geom = geometry.geometry;
          var geoJson = geometry.geometry.toGeoJSON();

          geoJson.properties = {};
          for (var key in feature.values) {
            if(feature.values.hasOwnProperty(key) && key != feature.getGeometryColumn().name) {
              var column = info.columnMap[key];
              geoJson.properties[column.displayName] = currentRow.values[key];
            }
          }
        }
        rowDone();
      });
    });
  });
});

```

### Installation ###

This will install the package from github

```
npm install ngageoint/geopackage-js
```

### Dependencies ###

#### NPM Modules ####

* [async](https://github.com/caolan/async) (The MIT License (MIT)) Async utilities for node and the browser
* [file-type](https://github.com/sindresorhus/file-type) (The MIT License (MIT)) Detect the file type of a Buffer/Uint8Array
* [proj4](http://proj4js.org/) (The MIT License (MIT)) JavaScript library to transform coordinates from one coordinate system to another, including datum transformations
* [lwip](https://github.com/EyalAr/lwip) (The MIT License (MIT)) Light-weight image processor for NodeJS
* [sql.js](https://github.com/kripken/sql.js/) (The MIT License (MIT)) SQLite compiled to javascript
* [sqlite3](https://github.com/mapbox/node-sqlite3) (BSD-3-Clause) Asynchronous, non-blocking SQLite3 bindings for Node.js.
* [wkx](https://github.com/cschwarz/wkx) (The MIT License (MIT)) A WKT/WKB/EWKT/EWKB/TWKB/GeoJSON parser and serializer
