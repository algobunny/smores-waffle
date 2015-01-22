var mongoose = require('mongoose');
var async = require('async');

var Venue = require('../models/venue');
var Picture = require('../models/picture');

var Request4S = require('../services/fs_request');
var RequestImagga = require('../services/imagga_request');

var SeekerSchema = new mongoose.Schema({
	created_at: {type:Date, default: Date.now },
	created_by : mongoose.Schema.Types.ObjectId,
	tag: String,
	lat: Number,
	lon: Number,
	pictures: [mongoose.Schema.Types.ObjectId],
	discoveredVenues: {type: Number, default: 0 },
	completed: {type: Boolean, default: false}
});

var Seeker = mongoose.model('Seeker', SeekerSchema);

function processPhoto(seeker, fsPhotoJson, venue_id){
	var img_url =  fsPhotoJson.prefix+'original'+fsPhotoJson.suffix;
	console.log(img_url);
	
	var picture = new Picture({
		fs_id: fsPhotoJson.i,
		prefix: fsPhotoJson.prefix,
		suffix: fsPhotoJson.suffix,
		venue_id: venue_id
	});
	picture.usable = true;
	picture.save(function(err){
		if(err){
			console.log(err);
			return;
		}

		RequestImagga.tag(img_url, function(d){
			var tags = d.tags.filter(function(e){
				return e.confidence > 15.0;
			});
			for(var i=0; i<tags.length; i++){
				picture.tags.push({
					name: tags[i].tag,
					confidence: tags[i].confidence
				});
				if(seeker.tag==tags[i].tag){
					seeker.pictures.push(picture);
					seeker.save();
				}
			}
			console.log(tags);
			picture.save(); 
		});
	});
	
}

function requestPhotos(seeker, venue){
	Request4S.get('venues/'+venue.fs_id+'/photos','limit=10', function(d){
		console.log(d);
		var photos = d.response.photos.items;
		var photosProccessor = photos.map(function(p){
			return processPhoto(seeker, p, venue.id);
		});
		
		async.parallel(photosProccessor, function(err, results){
			seeker.completed = true;
			seeker.save();
		});
	});
}

function proccessNewVenue(seeker, json){
	var newVenue = new Venue({
		fs_id: json.id,
		name: json.name,
		lat: json.location.lat,
		lon: json.location.lng
	});
	newVenue.save(function(err){
		if(err){
			return console.log(err);
		}
		requestPhotos(seeker, newVenue);
	});
}

function handleFoundVenues(seeker, venues){
	var venuesProccessFunctions = venues.map(function(json){
		return function(callback){
			Venue.findOne({'fs_id':json.id}, function(err, vEntry){
				if (err){
					console.log(err);
					callback(null, 0);
				} 
				else if( vEntry==null){
					proccessNewVenue(seeker, json);
					callback(null, 0);
				}
				else {
					img = vEntry.matchBestImage(seeker.tag);
					if (img!=null){
						// add to result list
						seeker.pictures.push(img);
					}
					else { // flag venue for update job
						vEntry.updateImages = true;
						vEntry.save();
					}
					callback(null, 1);
				}
			});
		};
	});

	async.parallel(venuesProccessFunctions, function(err, results){
		var foundVenues = results.reduce(function(a, b) { return a + b; });

		seeker.discoveredVenues -= foundVenues;
		if(seeker.discoveredVenues==0){
			seeker.completed = true;
		}
		
		seeker.save(function(err){
			if(err){
				console.log(err);
			}
		});
	});

};

Seeker.prototype.proccess = function(){
	var seeker = this;
	Request4S.get('venues/search','ll='+this.lat+','+this.lon+'&query='+this.tag
		+'&limit=3', function(d){
		seeker.discoveredVenues = d.response.venues.length;
		seeker.save(function(err){
			if(err){
				console.log(err);
				return;
			}
			handleFoundVenues(seeker, d.response.venues);
		});
		
	});
};

module.exports = Seeker;

