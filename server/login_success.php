<?php
	if(!isset($_COOKIE['loggedin'])){
		header("location:login.php");
	}
?>

<html>
	<body>
		<h1>Welcome!</h1>
		<a href="logout.php">Logout</a>
	</body>
</html>
