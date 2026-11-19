"""Drop 5: the 100 approved ideas (holiday, family, sports, outdoors, jobs, pets, hobbies, funny, faith, western)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import build

def d(who, name, tpl, pal, lines, icon=None, tags=(), blurb="", theme="Graphic", **kw):
    x = dict(who=who, name=name, tpl=tpl, pal=pal, lines=list(lines), tags=list(tags), blurb=blurb, theme=theme, **kw)
    if icon: x["icon"] = icon
    return x

XM = dict(xmas=True)
D = [
 # ---- Christmas and winter ----
 d("U", "Christmas Tree Farm", "club", "xmas_retro", ["CHRISTMAS TREE", "FARM"], "truck", ["christmas tree farm", "vintage christmas", "red truck shirt", "tree farm tee", "farmhouse xmas"], "A red pickup hauling home the tree. Fresh cut, family owned.", "Christmas", sub="FRESH CUT · FAMILY OWNED", est="1985", **XM),
 d("K", "Hot Cocoa Club", "club", "xmas_red", ["HOT COCOA", "CLUB"], "hot", ["hot cocoa shirt", "kids christmas tee", "cocoa club", "winter kids shirt", "marshmallow tee"], "Members get extra marshmallows.", "Christmas", sub="EXTRA MARSHMALLOWS", **XM),
 d("F", "Cookie Baking Crew", "badge", "xmas_w", ["COOKIE BAKING", "CREW"], "cookie", ["baking crew", "christmas baking", "family baking tee", "cookie crew", "matching xmas tee"], "For the whole family in the kitchen on cookie day.", "Christmas", **XM),
 d("F", "Most Likely to Burn the Cookies", "mostlikely", "xmas_red", ["burn", "THE COOKIES"], tags=["most likely to", "family matching", "christmas pajamas", "family xmas tee", "burnt cookies"], blurb="Part of the Most Likely To family set.", theme="Christmas", **XM),
 d("F", "Most Likely to Open Presents Early", "mostlikely", "xmas_red", ["open presents", "EARLY"], tags=["most likely to", "family matching", "christmas pajamas", "family xmas tee", "present peeker"], blurb="Part of the Most Likely To family set.", theme="Christmas", **XM),
 d("F", "Most Likely to Be on Their Phone", "mostlikely", "xmas_red", ["be on", "THEIR PHONE"], tags=["most likely to", "family matching", "christmas pajamas", "family xmas tee", "phone addict"], blurb="Part of the Most Likely To family set.", theme="Christmas", **XM),
 d("F", "Most Likely to Start Drama at Dinner", "mostlikely", "xmas_red", ["start drama", "AT DINNER"], tags=["most likely to", "family matching", "christmas pajamas", "family xmas tee", "family drama"], blurb="Part of the Most Likely To family set.", theme="Christmas", **XM),
 d("W", "Christmas Movie Marathon Club", "club", "xmas_pink", ["CHRISTMAS MOVIE", "MARATHON"], "popcorn", ["christmas movies", "movie marathon", "pink christmas", "hallmark movie fan", "cozy christmas"], "Blankets, cocoa and no spoilers.", "Christmas", sub="BLANKETS · COCOA · NO SPOILERS", **XM),
 d("W", "Howdy Holidays", "cup", "xmas_retro", ["howdy", "HOLIDAYS", "WESTERN CHRISTMAS"], "cowboyhat", ["western christmas", "howdy shirt", "cowgirl christmas", "country christmas", "rodeo christmas"], "Boots on, tree up.", "Western Christmas", **XM),
 d("U", "Ski Lodge Club", "club", "navy", ["SKI LODGE", "CLUB"], "skis", ["ski shirt", "apres ski", "ski lodge tee", "winter vacation", "snowboard gift"], "Vintage après-ski crest.", "Ski", sub="APRÈS SKI · HOT COCOA", grunge=True),
 d("W", "Soup Season", "wavy", "retro", ["SOUP"], tags=["soup season", "fall soup shirt", "cozy season", "foodie tee", "winter shirt"], blurb="Retro wavy lettering. It's soup season.", theme="Winter", sub="it's soup season, baby"),
 d("U", "Cold Hands Warm Coffee", "quote", "navy", ["Cold hands,", "warm coffee."], "hot", ["winter coffee", "coffee lover gift", "cold weather tee", "cozy coffee", "winter shirt"], "Winter mornings, sorted.", "Winter Coffee", sub="WINTER MORNINGS"),
 d("W", "Santa's Favorite Nurse", "club", "xmas_pink", ["SANTA'S FAVORITE", "NURSE"], "heartbeat", ["nurse christmas", "christmas nurse", "nurse gift", "rn christmas", "holiday nurse"], "On call all holiday.", "Nurse Christmas", sub="ON CALL ALL HOLIDAY", **XM),
 d("W", "Teacher Off Duty", "stack", "xmas_w", ["teacher", "OFF DUTY", "winter break mode"], "apple", ["teacher christmas", "teacher winter break", "teacher gift", "off duty teacher", "teacher xmas tee"], "Grades are in. Phone is off.", "Teacher Christmas", **XM),
 d("W", "Coffee Is My Valentine", "cup", "pink", ["coffee is my", "VALENTINE", "LOVE AT FIRST SIP"], "latte", ["valentine coffee", "valentines shirt", "galentines tee", "coffee lover gift", "anti valentine"], "Love at first sip.", "Valentine"),
 # ---- Thanksgiving and New Year ----
 d("U", "New Year Same Coffee", "quote", "retro", ["New year,", "same coffee."], "star", ["new year shirt", "new years eve", "coffee lover gift", "resolution tee", "funny new year"], "The only resolution that sticks.", "New Year", sub="CHEERS TO 2027"),
 d("U", "Turkey Trot Survivor", "club", "retro", ["TURKEY TROT", "SURVIVOR"], "turkey", ["turkey trot", "thanksgiving run", "5k shirt", "thanksgiving tee", "running shirt"], "Will run for pie.", "Thanksgiving", sub="WILL RUN FOR PIE"),
 d("U", "Here for the Pie", "cup", "retro", ["i'm only here", "FOR THE PIE", "THANKSGIVING 2026"], "pie", ["thanksgiving shirt", "pie lover", "funny thanksgiving", "friendsgiving tee", "pie shirt"], "Skip the turkey. Get to dessert.", "Thanksgiving"),
 d("U", "Stretchy Pants Season", "sunset", "sand_m", ["STRETCHY PANTS", "season starts now"], "turkey", ["stretchy pants", "thanksgiving shirt", "funny thanksgiving", "food coma tee", "friendsgiving tee"], "Retro sunset for the food coma.", "Thanksgiving"),
 d("M", "Thankful for Leftovers", "badge", "forest", ["THANKFUL FOR", "LEFTOVERS"], "turkey", ["thanksgiving shirt", "leftovers tee", "funny thanksgiving", "turkey day shirt", "dad thanksgiving"], "The best meal is the one at midnight.", "Thanksgiving"),
 # ---- Family milestones ----
 d("W", "Promoted to Grandma", "club", "mauve", ["PROMOTED TO", "GRANDMA"], "heart", ["promoted to grandma", "new grandma gift", "pregnancy reveal", "grandma est", "baby announcement"], "Spoiling starts soon.", "Grandma", sub="SPOILING STARTS SOON", est="2027"),
 d("M", "Promoted to Grandpa", "club", "navy", ["PROMOTED TO", "GRANDPA"], "star", ["promoted to grandpa", "new grandpa gift", "pregnancy reveal", "grandpa est", "baby announcement"], "Officially the backup dad.", "Grandpa", sub="BACKUP DAD REPORTING", est="2027"),
 d("W", "Mama Est 2026", "stack", "pink", ["est. 2026", "MAMA", "worth every sleepless night"], "heart", ["mama est 2026", "new mom gift", "first mothers day", "baby shower gift", "mama shirt"], "For the newest mama.", "New Mom"),
 d("M", "Dad Est 2026", "stack", "charcoal", ["est. 2026", "DAD", "coffee, diapers, repeat"], "hot", ["dad est 2026", "new dad gift", "first fathers day", "baby shower gift", "dad shirt"], "For the newest dad.", "New Dad"),
 d("K", "Big Sister Loading", "stack", "pink", ["big sister", "LOADING...", "coming soon"], "battery", ["big sister shirt", "sibling reveal", "pregnancy reveal", "big sister gift", "baby announcement"], "The cutest pregnancy announcement.", "Big Sister"),
 d("K", "Big Brother Loading", "stack", "navy", ["big brother", "LOADING...", "coming soon"], "battery", ["big brother shirt", "sibling reveal", "pregnancy reveal", "big brother gift", "baby announcement"], "The cutest pregnancy announcement.", "Big Brother"),
 d("W", "Raised on Coffee Raising Tiny Humans", "quote", "retro", ["Raised on coffee,", "raising tiny humans."], "hot", ["mom coffee shirt", "mom life tee", "funny mom shirt", "mothers day gift", "coffee mom"], "Generational caffeine.", "Mom", sub="MOM LIFE"),
 d("W", "Mom Taxi Service", "badge", "sage", ["MOM TAXI", "SERVICE"], "car", ["mom taxi", "soccer mom shirt", "funny mom shirt", "busy mom tee", "mom life tee"], "No tips. Snacks required.", "Mom"),
 d("M", "Fueled by Coffee and Dad Jokes", "quote", "navy", ["Fueled by coffee", "& dad jokes."], "hot", ["dad joke shirt", "coffee dad", "funny dad shirt", "fathers day gift", "dad humor"], "Pun intended. Every time.", "Dad", sub="PUN INTENDED"),
 d("M", "Lawn Dad Stay Off the Grass", "stack", "forest", ["lawn dad says", "STAY OFF", "the grass"], "mower", ["lawn dad", "lawn care shirt", "funny dad shirt", "yard work tee", "fathers day gift"], "Stripes take time.", "Dad"),
 # ---- Sports ----
 d("W", "Baseball Mom", "club", "retro", ["BASEBALL", "MOM"], "baseball", ["baseball mom", "baseball mama", "sports mom shirt", "little league mom", "game day mom"], "Loud and proud from the bleachers.", "Baseball Mom", sub="LOUD & PROUD"),
 d("W", "Softball Mom", "club", "sage", ["SOFTBALL", "MOM"], "softball", ["softball mom", "softball mama", "sports mom shirt", "travel ball mom", "game day mom"], "Sunflower seeds and sunscreen.", "Softball Mom", sub="SUNFLOWER SEEDS & SUNSCREEN"),
 d("W", "Football Mom", "club", "espresso", ["FOOTBALL", "MOM"], "football", ["football mom", "football mama", "sports mom shirt", "game day shirt", "friday night mom"], "Game day, every day.", "Football Mom", sub="GAME DAY · EVERY DAY"),
 d("W", "Volleyball Mom", "club", "mauve", ["VOLLEYBALL", "MOM"], "volleyball", ["volleyball mom", "volleyball mama", "sports mom shirt", "club volleyball", "game day mom"], "Here for the aces.", "Volleyball Mom", sub="HERE FOR THE ACES"),
 d("M", "Hockey Dad", "club", "navy", ["HOCKEY", "DAD"], "hockey", ["hockey dad", "hockey shirt", "sports dad shirt", "rink dad", "hockey gift"], "Cold rinks, hot coffee.", "Hockey Dad", sub="COLD RINKS · HOT COFFEE"),
 d("M", "Sideline Dad Club", "club", "charcoal", ["SIDELINE DAD", "CLUB"], "baseball", ["sports dad shirt", "sideline dad", "baseball dad", "game day dad", "dad gift"], "Coaching from the bleachers.", "Sports Dad", sub="COACHING FROM THE BLEACHERS"),
 d("U", "Pickleball Club", "club", "sage", ["PICKLEBALL", "CLUB"], "pickleball", ["pickleball shirt", "pickleball club", "pickleball gift", "paddle sports", "pickleball player"], "Dink, drive, repeat.", "Pickleball", sub="DINK · DRIVE · REPEAT"),
 d("W", "Pickleball Is My Therapy", "quote", "retro", ["Pickleball", "is my therapy."], "pickleball", ["pickleball shirt", "pickleball gift", "pickleball women", "funny pickleball", "paddle sports"], "Court is in session.", "Pickleball", sub="COURT IS IN SESSION"),
 d("M", "Fantasy League Champion", "badge", "black", ["FANTASY LEAGUE", "CHAMPION"], "trophy", ["fantasy football", "league champion", "fantasy champ", "football fan gift", "draft day shirt"], "Bragging rights, printed.", "Fantasy Football"),
 d("M", "Weekend Forecast Golf", "forecast", "forest", ["GOLF", "with a chance of beer"], "flag", ["golf shirt", "golfer gift", "weekend forecast", "funny golf tee", "golf dad"], "100% chance of tee times.", "Golf"),
 # ---- Outdoors and men's hobbies ----
 d("M", "Duck Season", "sunset", "espresso_dark", ["DUCK SEASON", "early mornings, cold blinds"], "duck", ["duck hunting", "duck season", "hunting shirt", "waterfowl tee", "hunter gift"], "Vintage sunset for waterfowl season.", "Hunting"),
 d("W", "Hunting Season Widow", "quote", "mauve", ["Hunting season", "widow."], "moon", ["hunting widow", "hunting wife", "funny hunting", "deer season wife", "hunter wife gift"], "See you in December.", "Hunting", sub="SEE YOU IN DECEMBER"),
 d("M", "Hooked on Fishing", "badge", "navy", ["HOOKED ON", "FISHING"], "fish", ["fishing shirt", "fisherman gift", "bass fishing", "fishing dad", "angler tee"], "Vintage badge for the dock and the boat.", "Fishing"),
 d("U", "Camp More Worry Less", "sunset", "sand_m", ["CAMP MORE", "worry less"], "mountain", ["camping shirt", "camp more", "outdoors tee", "hiking shirt", "mountain tee"], "Retro mountain sunset.", "Camping"),
 d("U", "Lake Days Club", "club", "retro", ["LAKE DAYS", "CLUB"], "sun", ["lake shirt", "lake days", "summer tee", "boat day shirt", "lake house tee"], "Sun, dock, repeat.", "Lake", sub="SUN · DOCK · REPEAT"),
 d("M", "Cowboy Coffee Club", "club", "espresso_dark", ["COWBOY COFFEE", "CLUB"], "cowboyhat", ["cowboy coffee", "western shirt", "coffee lover him", "campfire coffee", "country tee"], "Campfire brewed. Strong enough to stand a spoon in.", "Western Coffee", sub="CAMPFIRE BREWED"),
 d("M", "Bourbon and Cigars Club", "club", "black", ["BOURBON & CIGARS", "CLUB"], "glass", ["bourbon shirt", "cigar shirt", "whiskey gift", "bourbon lover", "mens gift"], "Sip slow, smoke slower.", "Bourbon", sub="SIP SLOW · SMOKE SLOWER"),
 d("M", "Grease Monkey Club", "club", "charcoal", ["GREASE MONKEY", "CLUB"], "wrench", ["mechanic shirt", "grease monkey", "car guy gift", "garage shirt", "diy dad"], "If it's broke, he'll fix it.", "Mechanic", sub="IF IT'S BROKE I'LL FIX IT"),
 d("M", "I Paused My Game to Be Here", "quote", "black", ["I paused my game", "to be here."], "controller", ["gamer shirt", "funny gamer tee", "video game gift", "gaming shirt", "gamer dad"], "Player one, reluctantly present.", "Gamer", sub="PLAYER ONE"),
 d("M", "Weekend Forecast Fishing", "forecast", "navy", ["FISHING", "with a chance of naps"], "fish", ["fishing shirt", "weekend forecast", "funny fishing tee", "fishing dad", "fisherman gift"], "100% chance of fishing.", "Fishing"),
 d("U", "Trail Runner Club", "club", "sage", ["TRAIL RUNNER", "CLUB"], "shoe", ["trail running", "runner gift", "running shirt", "ultra runner", "run club tee"], "Dirt, sweat, coffee.", "Running", sub="DIRT · SWEAT · COFFEE"),
 d("M", "Beer Run Club", "club", "forest", ["BEER RUN", "CLUB"], "beer", ["beer run", "funny running", "beer shirt", "run club tee", "craft beer gift"], "We run for the beer.", "Beer", sub="WE RUN FOR THE BEER"),
 # ---- Jobs ----
 d("W", "Lineman Wife", "club", "espresso", ["LINEMAN", "WIFE"], "bolt", ["lineman wife", "lineman shirt", "lineworker wife", "storm chaser wife", "lineman gift"], "Keeping the lights on.", "Lineman Wife", sub="KEEPING THE LIGHTS ON"),
 d("W", "Firefighter Wife", "club", "retro", ["FIREFIGHTER", "WIFE"], "flame", ["firefighter wife", "fire wife shirt", "first responder", "firefighter gift", "fire wife"], "My hero wears boots.", "Firefighter Wife", sub="MY HERO WEARS BOOTS"),
 d("W", "Vet Tech Life", "stack", "sage", ["vet tech", "LIFE", "fur, fluids & love"], "paw", ["vet tech shirt", "vet tech gift", "veterinary tech", "vet nurse", "animal lover tee"], "For the people who hold the paws.", "Vet Tech"),
 d("W", "Behind the Chair Club", "club", "pink", ["BEHIND THE CHAIR", "CLUB"], "scissors", ["hairstylist shirt", "hair stylist gift", "salon shirt", "cosmetologist", "barber tee"], "For hairstylists.", "Hairstylist", sub="HAIRSTYLIST · SALON LIFE"),
 d("W", "ER Nurse I've Seen Things", "quote", "mauve", ["ER nurse.", "I've seen things."], "heartbeat", ["er nurse shirt", "emergency nurse", "nurse gift", "funny nurse tee", "rn shirt"], "And you don't want to know.", "ER Nurse", sub="EMERGENCY DEPARTMENT"),
 d("M", "Long Haul Coffee Club", "club", "charcoal", ["LONG HAUL COFFEE", "CLUB"], "semi", ["trucker shirt", "truck driver gift", "trucker coffee", "semi truck tee", "cdl driver"], "Trucker fuel.", "Trucker", sub="TRUCKER FUEL"),
 d("M", "Shockingly Good Electrician", "badge", "black", ["SHOCKINGLY GOOD", "ELECTRICIAN"], "bolt", ["electrician shirt", "electrician gift", "funny electrician", "sparky shirt", "tradesman tee"], "A pun with a little zap.", "Electrician"),
 d("U", "Tax Season Survivor", "club", "sage", ["TAX SEASON", "SURVIVOR"], "check", ["tax season", "accountant shirt", "cpa gift", "bookkeeper tee", "tax preparer"], "January through April. Somehow.", "Accountant", sub="JAN · FEB · MAR · APR"),
 d("U", "Certified Bean Counter", "stack", "espresso", ["certified", "BEAN COUNTER", "accountant & coffee lover"], "bean", ["bean counter", "accountant shirt", "cpa gift", "coffee lover gift", "funny accountant"], "Counts beans. Also drinks them.", "Accountant"),
 d("U", "Barista Life Oat Milk", "quote", "espresso", ["Barista life.", "Ask me about oat milk."], "pour", ["barista shirt", "barista gift", "coffee shop tee", "oat milk latte", "coffee lover gift"], "For the folks behind the bar.", "Barista", sub="ESPRESSO BAR"),
 d("W", "Real Estate Coffee Club", "club", "mauve", ["REAL ESTATE COFFEE", "CLUB"], "house", ["real estate agent", "realtor gift", "real estate shirt", "broker gift", "open house tee"], "Open houses and oat lattes.", "Real Estate", sub="OPEN HOUSES & OAT LATTES"),
 d("U", "Night Shift Club", "club", "navy", ["NIGHT SHIFT", "CLUB"], "moon", ["night shift shirt", "night shift worker", "nurse night shift", "graveyard shift", "night owl tee"], "While you sleep, we work.", "Night Shift", sub="WHILE YOU SLEEP, WE WORK"),
 # ---- Pets ----
 d("W", "Cat Mama", "daisy", "retro", ["Cat mama", "est. 2026", "PURRS · NAPS · CAT HAIR"], "cat", ["cat mom shirt", "cat mama", "cat lover gift", "cat lady tee", "retro cat shirt"], "Retro daisies for the cat mama.", "Cat Mom"),
 d("W", "Cat Hair Is My Glitter", "quote", "pink", ["Cat hair", "is my glitter."], "cat", ["cat hair shirt", "cat mom shirt", "funny cat tee", "cat lover gift", "cat lady"], "Every outfit, extra sparkle.", "Cat Mom", sub="CAT MOM LIFE"),
 d("W", "Golden Retriever Mama", "club", "espresso", ["GOLDEN RETRIEVER", "MAMA"], "paw", ["golden retriever", "golden mom", "dog mom shirt", "dog lover gift", "golden mama"], "Shedding since day one.", "Dog Mom", sub="SHEDDING SINCE DAY ONE"),
 d("W", "Doodle Mom", "daisy", "pink", ["Doodle mom", "fluff & love"], "paw", ["doodle mom", "goldendoodle", "labradoodle", "dog mom shirt", "doodle mama"], "Fluff, love and zoomies.", "Dog Mom"),
 d("M", "Frenchie Dad", "club", "charcoal", ["FRENCHIE", "DAD"], "paw", ["frenchie dad", "french bulldog", "dog dad shirt", "dog lover gift", "frenchie gift"], "Snores included.", "Dog Dad", sub="SNORES INCLUDED"),
 d("M", "German Shepherd Dad", "club", "forest", ["GERMAN SHEPHERD", "DAD"], "paw", ["german shepherd", "gsd dad", "dog dad shirt", "dog lover gift", "shepherd gift"], "Loyal, loud, loved.", "Dog Dad", sub="LOYAL · LOUD · LOVED"),
 d("U", "Wiener Dog Club", "club", "retro", ["WIENER DOG", "CLUB"], "dachshund", ["dachshund shirt", "wiener dog", "doxie mom", "dog lover gift", "sausage dog"], "Short legs, big heart.", "Dachshund", sub="SHORT LEGS · BIG HEART"),
 d("W", "Chicken Mama Club", "club", "sage", ["CHICKEN MAMA", "CLUB"], "chicken", ["chicken mom", "chicken lady", "backyard chickens", "farm shirt", "homestead tee"], "Fresh eggs daily.", "Chicken", sub="FRESH EGGS DAILY"),
 d("W", "Horse Girl Club", "club", "mauve", ["HORSE GIRL", "CLUB"], "horseshoe", ["horse girl", "equestrian shirt", "horse lover gift", "barn shirt", "rodeo girl"], "Barn hair, don't care.", "Horse", sub="BARN HAIR · DON'T CARE"),
 d("U", "Dog Hair Don't Care", "quote", "sand_m", ["Dog hair,", "don't care."], "paw", ["dog hair shirt", "dog lover gift", "funny dog tee", "dog owner gift", "dog people"], "Lint rollers are optional.", "Dog Lover", sub="DOG PEOPLE"),
 d("M", "Rescue Dog Dad", "badge", "navy", ["RESCUE DOG", "DAD"], "paw", ["rescue dog dad", "adopt dont shop", "dog dad shirt", "rescue gift", "shelter dog"], "Who rescued who?", "Dog Dad"),
 # ---- Books, hobbies, wellness ----
 d("W", "Book Boyfriend Club", "club", "pink", ["BOOK BOYFRIEND", "CLUB"], "book", ["book boyfriend", "romance reader", "bookish shirt", "book lover gift", "fictional men"], "Fictional men only.", "Bookish", sub="FICTIONAL MEN ONLY"),
 d("W", "Annotated and Obsessed", "quote", "mauve", ["Annotated", "& obsessed."], "book", ["annotating books", "bookish shirt", "book lover gift", "reader tee", "book club shirt"], "Tabs, highlights and tears.", "Bookish", sub="TABS · HIGHLIGHTS · TEARS"),
 d("W", "Plant Lady Club", "club", "sage", ["PLANT LADY", "CLUB"], "plant", ["plant lady", "plant mom", "houseplant shirt", "plant lover gift", "gardener tee"], "More plants, please.", "Plant Mom", sub="MORE PLANTS PLEASE"),
 d("W", "Crochet Club", "club", "retro", ["CROCHET", "CLUB"], "yarn", ["crochet shirt", "crochet gift", "yarn lover", "knitting tee", "crafter gift"], "One more row.", "Crochet", sub="ONE MORE ROW"),
 d("W", "Dirt Therapy", "stack", "espresso", ["garden girl", "DIRT THERAPY", "grow your own way"], "wildflower", ["gardening shirt", "garden lover", "plant lady tee", "gardener gift", "flower garden"], "Hands in the soil.", "Gardening"),
 d("W", "Pilates and Iced Coffee", "iconwave", "pink", ["PILATES &", "ICED COFFEE"], "iced", ["pilates shirt", "iced coffee shirt", "workout tee", "pilates girl", "gym coffee"], "Reformer, then cold brew.", "Pilates"),
 d("U", "Coffee Run Club", "club", "retro", ["COFFEE RUN", "CLUB"], "shoe", ["run club shirt", "coffee run club", "running shirt", "coffee lover gift", "runner gift"], "Will run for espresso.", "Run Club", sub="WILL RUN FOR ESPRESSO"),
 d("U", "Slow Mornings Club", "club", "espresso", ["SLOW MORNINGS", "CLUB"], "sun", ["slow mornings", "slow living tee", "coffee lover gift", "mindful shirt", "morning coffee"], "No alarms, just coffee.", "Slow Living", sub="NO ALARMS · JUST COFFEE"),
 d("W", "Breathe In Coffee Breathe Out Stress", "quote", "sage", ["Breathe in coffee,", "breathe out stress."], "lotus", ["mindful shirt", "yoga coffee", "self care tee", "coffee lover gift", "calm shirt"], "Mindful mornings.", "Mindful", sub="MINDFUL MORNINGS"),
 d("U", "CBD and Coffee Club", "club", "forest", ["CBD & COFFEE", "CLUB"], "hemp", ["cbd shirt", "hemp shirt", "cbd coffee", "wellness tee", "calm coffee"], "Calm, focused, caffeinated.", "CBD", sub="CALM · FOCUSED · CAFFEINATED"),
 d("U", "Inner Peace Outer Coffee", "badge", "espresso", ["INNER PEACE", "OUTER COFFEE"], "lotus", ["inner peace", "zen coffee", "mindful shirt", "yoga tee", "coffee lover gift"], "Balance, in a mug.", "Mindful"),
 # ---- Funny everyday ----
 d("U", "Social Battery 2 Percent", "stack", "mauve", ["social battery", "2%", "please recharge with coffee"], "battery_low", ["social battery", "introvert shirt", "funny introvert", "antisocial tee", "homebody shirt"], "Recharging. Do not disturb.", "Introvert"),
 d("W", "Professional Overthinker", "badge", "pink", ["PROFESSIONAL", "OVERTHINKER"], "star", ["overthinker shirt", "anxiety shirt", "funny womens tee", "mental health tee", "relatable shirt"], "Certified, unfortunately.", "Funny"),
 d("U", "Introverted but Willing to Discuss Coffee", "quote", "espresso", ["Introverted", "but willing to", "discuss coffee."], "hot", ["introvert shirt", "coffee lover gift", "funny coffee tee", "introvert gift", "coffee snob"], "Small talk, no. Coffee talk, yes.", "Introvert"),
 d("K", "Certified Snack Inspector", "club", "retro", ["CERTIFIED SNACK", "INSPECTOR"], "cookie", ["snack inspector", "funny kids shirt", "toddler tee", "kids snack shirt", "kids gift"], "Quality control department.", "Kids", sub="QUALITY CONTROL DEPT."),
 d("M", "Nap Champion", "badge", "navy", ["NAP", "CHAMPION"], "moon", ["nap shirt", "funny dad shirt", "nap champion", "lazy day tee", "sleep shirt"], "Undefeated on the couch.", "Funny"),
 d("W", "Running Late Is My Cardio", "quote", "retro", ["Running late", "is my cardio."], "clock", ["running late", "funny womens tee", "cardio shirt", "mom life tee", "relatable shirt"], "Always five minutes behind.", "Funny", sub="ALWAYS 5 MINUTES BEHIND"),
 d("U", "Single Origin Snob", "club", "espresso", ["SINGLE ORIGIN", "SNOB"], "bean", ["coffee snob", "single origin", "specialty coffee", "pour over gift", "coffee nerd"], "Washed, natural, honey. We have opinions.", "Coffee", sub="WASHED · NATURAL · HONEY"),
 d("U", "Cold Brew Crew", "iconwave", "sage", ["COLD BREW", "CREW"], "iced", ["cold brew shirt", "iced coffee shirt", "coffee crew", "coffee lover gift", "summer coffee"], "Steeped overnight. Sipped all day.", "Coffee"),
 d("W", "Faith Over Fear", "cup", "mauve", ["faith", "OVER FEAR", "WALK BY FAITH"], "cross", ["faith over fear", "christian shirt", "faith tee", "church shirt", "jesus shirt"], "A reminder to wear.", "Faith"),
 d("W", "Coffee and Jesus", "daisy", "retro", ["Coffee", "& Jesus", "BLESSED · CAFFEINATED"], "cross", ["coffee and jesus", "christian shirt", "faith tee", "church shirt", "coffee lover gift"], "Every morning starts the same way.", "Faith"),
 # ---- Western and retro ----
 d("W", "Rodeo Season", "sunset", "retro", ["RODEO SEASON", "boots, buckles & dust"], "cowboyhat", ["rodeo shirt", "western shirt", "cowgirl tee", "country concert", "rodeo season"], "Retro western sunset.", "Western"),
 d("W", "Wildflower Season", "daisy", "sage", ["Wildflower", "season"], "wildflower", ["wildflower shirt", "floral tee", "spring shirt", "boho shirt", "flower lover"], "Retro florals for spring.", "Floral"),
 d("U", "Sunset Chaser", "sunset", "retro", ["SUNSET CHASER", "golden hour, always"], "cactus", ["sunset shirt", "desert tee", "boho shirt", "travel shirt", "retro sunset"], "Retro desert sunset.", "Retro"),
 d("W", "Mushroom Moon Tarot", "tarot", "mauve", ["MUSHROOM MOON"], "mushroom", ["mushroom shirt", "tarot shirt", "celestial tee", "cottagecore", "witchy shirt"], "Card XVIII: Mushroom Moon.", "Celestial", num="XVIII"),
]
assert len(D) == 100, len(D)

if __name__ == "__main__":
    out, rows = build("drop5", D, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "drops"))
    print(out, len(rows), "designs")
    print("max title", max(len(r["title"]) for r in rows), "min tags", min(len(r["tags"].split(",")) for r in rows))
